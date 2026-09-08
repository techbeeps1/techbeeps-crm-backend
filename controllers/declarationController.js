const Declaration = require('../models/declarationModel');
const User = require('../models/user');
const JobSchedule = require('../models/jobSchedule');

// Helper to robustly extract user context from token
const getUserContext = (req) => {
  const user = req.user || {};
  const role = user.role || user.user?.role || '';
  const userId =
    user.userId || user.id || user._id || user.user?.userId || user.user?.id || user.user?._id || '';
  const username =
    user.username || user.name || user.user?.username || user.user?.name || 'Staff Member';
  const isAdmin =
    role === 'Admin' ||
    role === 'admin' ||
    user.isAdmin === true ||
    user.user?.isAdmin === true ||
    user.role === 'Admin';
  return { role, userId, username, isAdmin };
};

// 1. GET ALL DECLARATIONS (WITH FILTERS & SUMMARY METRICS)
exports.getDeclarations = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      employeeId,
      status = 'All',
      declarationType = 'All',
      search = '',
    } = req.query;

    const filter = {};

    // Role-based security scoping
    const { userId, isAdmin } = getUserContext(req);
    const isStaffOrAgent = !isAdmin;
    const effectiveEmployeeId = isStaffOrAgent
      ? userId
      : (employeeId && employeeId !== 'all' ? employeeId : null);

    if (effectiveEmployeeId) {
      filter.employeeId = effectiveEmployeeId;
    }

    // Date Range Filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filter.date = { $gte: start };
    }

    // Status Filter
    if (status && status !== 'All') {
      filter.status = status;
    }

    // Declaration Type Filter
    if (declarationType && declarationType !== 'All') {
      filter.declarationType = declarationType;
    }

    // Fetch matching declarations
    let declarations = await Declaration.find(filter)
      .populate('employeeId', 'username email role telephone photo')
      .populate('reviewedBy', 'username email')
      .populate('paidBy', 'username email')
      .populate({
        path: 'jobId',
        select: 'index customer load unload status',
        populate: {
          path: 'customer',
          select: 'firstName lastName companyName',
        },
      })
      .sort({ date: -1, createdAt: -1 });

    // Search filter across title, employee name, jobIndex, or notes
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      declarations = declarations.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.employeeName.toLowerCase().includes(q) ||
          (d.jobIndex && d.jobIndex.toLowerCase().includes(q)) ||
          (d.description && d.description.toLowerCase().includes(q)) ||
          d.declarationType.toLowerCase().includes(q)
      );
    }

    // Calculate Summary Metrics
    let totalDeclaredAmount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let approvedAmount = 0;
    let approvedCount = 0;
    let paidAmount = 0;
    let paidCount = 0;
    let rejectedAmount = 0;
    let rejectedCount = 0;

    declarations.forEach((d) => {
      const amt = Number(d.amount) || 0;
      totalDeclaredAmount += amt;

      if (d.status === 'Approved') {
        approvedAmount += amt;
        approvedCount += 1;
      } else if (d.status === 'Paid') {
        paidAmount += amt;
        paidCount += 1;
        // Paid also counts as approved previously
        approvedAmount += amt;
      } else if (d.status === 'Rejected') {
        rejectedAmount += amt;
        rejectedCount += 1;
      } else if (d.status === 'Pending') {
        pendingAmount += amt;
        pendingCount += 1;
      }
    });

    res.status(200).json({
      success: true,
      count: declarations.length,
      data: declarations,
      summary: {
        totalDeclaredAmount: Number(totalDeclaredAmount.toFixed(2)),
        totalCount: declarations.length,
        pendingAmount: Number(pendingAmount.toFixed(2)),
        pendingCount,
        approvedAmount: Number(approvedAmount.toFixed(2)),
        approvedCount,
        paidAmount: Number(paidAmount.toFixed(2)),
        paidCount,
        rejectedAmount: Number(rejectedAmount.toFixed(2)),
        rejectedCount,
      },
    });
  } catch (error) {
    console.error('Error in getDeclarations:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. CREATE NEW DECLARATION
exports.createDeclaration = async (req, res) => {
  try {
    const {
      employeeId,
      declarationType,
      title,
      amount,
      currency = 'EUR',
      date,
      distanceKm = 0,
      ratePerKm = 0.23,
      startLocation = '',
      destinationLocation = '',
      jobId,
      jobIndex,
      description = '',
      receiptUrl = '',
      receiptName = '',
      items = [],
    } = req.body;

    const formattedItems = Array.isArray(items)
      ? items.map((it) => ({
          declarationType: it.declarationType || 'Other Out-of-Pocket',
          title: (it.title || '').trim(),
          amount: Number(it.amount) || 0,
          distanceKm: Number(it.distanceKm) || 0,
          startLocation: (it.startLocation || '').trim(),
          destinationLocation: (it.destinationLocation || '').trim(),
          date: it.date ? new Date(it.date) : new Date(),
        }))
      : [];

    let finalAmount = Number(amount) || 0;
    if (formattedItems.length > 0) {
      finalAmount = Number(
        formattedItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0).toFixed(2)
      );
    } else if (declarationType === 'Travel & Mileage' && (!finalAmount || finalAmount <= 0)) {
      finalAmount = Number(((Number(distanceKm) || 0) * (Number(ratePerKm) || 0.23)).toFixed(2));
    }

    const finalTitle = title ? title.trim() : (formattedItems[0]?.title || 'Expense Claim');
    const finalType = declarationType || (formattedItems[0]?.declarationType || 'Other Out-of-Pocket');

    if (!finalTitle) {
      return res.status(400).json({
        success: false,
        message: 'Title and declaration category are required',
      });
    }

    // Determine target employee
    const { userId, username, isAdmin } = getUserContext(req);
    const isStaffOrAgent = !isAdmin;
    let targetEmployeeId = isStaffOrAgent ? userId : (employeeId || userId);

    let employeeDoc = await User.findById(targetEmployeeId);
    if (!employeeDoc && !isStaffOrAgent && employeeId) {
      employeeDoc = await User.findById(employeeId);
      targetEmployeeId = employeeDoc?._id || employeeId;
    }

    const employeeName = employeeDoc?.username || username || 'Staff Member';
    const employeeRole = employeeDoc?.role || 'Staff';

    if (isNaN(finalAmount) || finalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid claim amount or distance',
      });
    }

    // If job specified, get job index if not provided
    let finalJobIndex = jobIndex || '';
    if (jobId && !finalJobIndex) {
      const jobDoc = await JobSchedule.findById(jobId).select('index');
      if (jobDoc) finalJobIndex = jobDoc.index;
    }

    const newDeclaration = new Declaration({
      employeeId: targetEmployeeId,
      employeeName,
      employeeRole,
      declarationType: finalType,
      title: finalTitle,
      amount: finalAmount,
      currency,
      date: date ? new Date(date) : new Date(),
      distanceKm: Number(distanceKm) || 0,
      ratePerKm: Number(ratePerKm) || 0.23,
      startLocation: startLocation.trim(),
      destinationLocation: destinationLocation.trim(),
      jobId: jobId || null,
      jobIndex: finalJobIndex,
      description: description.trim(),
      receiptUrl: receiptUrl.trim(),
      receiptName: receiptName.trim(),
      status: 'Pending',
      items: formattedItems,
    });

    const savedDoc = await newDeclaration.save();
    const populated = await Declaration.findById(savedDoc._id)
      .populate('employeeId', 'username email role photo')
      .populate({
        path: 'jobId',
        select: 'index customer load unload status',
        populate: {
          path: 'customer',
          select: 'firstName lastName companyName',
        },
      });

    res.status(201).json({
      success: true,
      message: 'Declaration submitted successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error in createDeclaration:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. GET DECLARATIONS FOR SPECIFIC EMPLOYEE (FOR STAFF SLIDER TAB 5)
exports.getEmployeeDeclarations = async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const declarations = await Declaration.find({ employeeId })
      .populate('reviewedBy', 'username email')
      .populate('paidBy', 'username email')
      .populate({
        path: 'jobId',
        select: 'index customer load unload status',
        populate: {
          path: 'customer',
          select: 'firstName lastName companyName',
        },
      })
      .sort({ date: -1, createdAt: -1 });

    let totalAmount = 0;
    let pendingAmount = 0;
    let approvedAmount = 0;
    let paidAmount = 0;

    declarations.forEach((d) => {
      const amt = Number(d.amount) || 0;
      totalAmount += amt;
      if (d.status === 'Pending') pendingAmount += amt;
      if (d.status === 'Approved') approvedAmount += amt;
      if (d.status === 'Paid') {
        paidAmount += amt;
        approvedAmount += amt;
      }
    });

    res.status(200).json({
      success: true,
      count: declarations.length,
      data: declarations,
      summary: {
        totalAmount: Number(totalAmount.toFixed(2)),
        pendingAmount: Number(pendingAmount.toFixed(2)),
        approvedAmount: Number(approvedAmount.toFixed(2)),
        paidAmount: Number(paidAmount.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Error in getEmployeeDeclarations:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UPDATE DECLARATION STATUS (APPROVE, REJECT, MARK AS PAID)
exports.updateDeclarationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      reviewerComment = '',
      paymentReference = '',
      approvedAmount,
    } = req.body;

    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Paid', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const declaration = await Declaration.findById(id);
    if (!declaration) {
      return res.status(400).json({ success: false, message: 'Declaration not found' });
    }

    const { userId, username, isAdmin } = getUserContext(req);

    declaration.status = status;
    if (reviewerComment !== undefined) {
      declaration.reviewerComment = reviewerComment;
    }

    if (status === 'Approved') {
      declaration.reviewedBy = userId || null;
      declaration.reviewerName = username || 'Supervisor';
      declaration.reviewedAt = new Date();
      if (approvedAmount !== undefined && Number(approvedAmount) >= 0) {
        declaration.amount = Number(approvedAmount);
      }
    } else if (status === 'Rejected') {
      declaration.reviewedBy = userId || null;
      declaration.reviewerName = username || 'Supervisor';
      if (!declaration.reviewerComment) {
        declaration.reviewerComment = 'Rejected by manager';
      }
      declaration.reviewedAt = new Date();
    } else if (status === 'Paid') {
      declaration.paidAt = new Date();
      declaration.paidBy = userId || null;
      declaration.paymentReference = paymentReference || declaration.paymentReference || 'Reimbursed';
      if (!declaration.reviewedBy) {
        declaration.reviewedBy = userId || null;
        declaration.reviewerName = username || 'Supervisor';
        declaration.reviewedAt = new Date();
      }
    } else if (status === 'Cancelled') {
      declaration.reviewedBy = userId || null;
      declaration.reviewerName = username || 'Supervisor';
      declaration.reviewedAt = new Date();
    } else if (status === 'Pending') {
      declaration.reviewedBy = null;
      declaration.reviewerName = '';
      declaration.reviewedAt = null;
      declaration.paidAt = null;
      declaration.paidBy = null;
    }

    const updated = await declaration.save();
    const populated = await Declaration.findById(updated._id)
      .populate('employeeId', 'username email role photo')
      .populate('reviewedBy', 'username email')
      .populate('paidBy', 'username email')
      .populate('jobId', 'index customer');

    res.status(200).json({
      success: true,
      message: `Declaration status updated to ${status}`,
      data: populated,
    });
  } catch (error) {
    console.error('Error in updateDeclarationStatus:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. UPDATE DECLARATION DETAILS
exports.updateDeclaration = async (req, res) => {
  try {
    const { id } = req.params;
    const declaration = await Declaration.findById(id);

    if (!declaration) {
      return res.status(404).json({ success: false, message: 'Declaration not found' });
    }

    const { role, userId, isAdmin } = getUserContext(req);
    if (declaration.status !== 'Pending') {
      return res.status(403).json({
        success: false,
        message: `Cannot edit a declaration with status '${declaration.status}'. To modify details or prices, status must first be reverted to 'Pending'.`,
      });
    }

    const {
      employeeId,
      title,
      declarationType,
      amount,
      date,
      distanceKm,
      ratePerKm,
      startLocation,
      destinationLocation,
      jobId,
      jobIndex,
      description,
      receiptUrl,
      receiptName,
      items,
    } = req.body;

    if (employeeId) {
      const empDoc = await User.findById(employeeId);
      if (empDoc) {
        declaration.employeeId = empDoc._id;
        declaration.employeeName = empDoc.username || 'Staff Member';
        declaration.employeeRole = empDoc.role || 'Staff';
      }
    }

    if (items && Array.isArray(items)) {
      declaration.items = items.map((it) => ({
        declarationType: it.declarationType || 'Other Out-of-Pocket',
        title: (it.title || '').trim(),
        amount: Number(it.amount) || 0,
        distanceKm: Number(it.distanceKm) || 0,
        startLocation: (it.startLocation || '').trim(),
        destinationLocation: (it.destinationLocation || '').trim(),
        date: it.date ? new Date(it.date) : new Date(),
      }));
      if (items.length > 0) {
        declaration.amount = Number(
          declaration.items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0).toFixed(2)
        );
        if (items[0]?.title) declaration.title = items[0].title.trim();
        if (items[0]?.declarationType) declaration.declarationType = items[0].declarationType;
        if (items[0]?.distanceKm !== undefined) declaration.distanceKm = Number(items[0].distanceKm) || 0;
        if (items[0]?.startLocation !== undefined) declaration.startLocation = items[0].startLocation.trim();
        if (items[0]?.destinationLocation !== undefined) declaration.destinationLocation = items[0].destinationLocation.trim();
        if (items[0]?.date) declaration.date = new Date(items[0].date);
      }
    }

    if (title && (!items || items.length === 0)) declaration.title = title.trim();
    if (declarationType && (!items || items.length === 0)) declaration.declarationType = declarationType;
    if (amount !== undefined && (!items || items.length === 0)) declaration.amount = Number(amount);
    if (date && (!items || items.length === 0)) declaration.date = new Date(date);
    if (distanceKm !== undefined && (!items || items.length === 0)) declaration.distanceKm = Number(distanceKm);
    if (ratePerKm !== undefined) declaration.ratePerKm = Number(ratePerKm);
    if (startLocation !== undefined && (!items || items.length === 0)) declaration.startLocation = startLocation.trim();
    if (destinationLocation !== undefined && (!items || items.length === 0)) declaration.destinationLocation = destinationLocation.trim();
    if (jobId !== undefined) {
      declaration.jobId = jobId || null;
      if (jobId && !jobIndex) {
        const jobDoc = await JobSchedule.findById(jobId).select('index');
        if (jobDoc) declaration.jobIndex = jobDoc.index;
      } else if (!jobId) {
        declaration.jobIndex = '';
      }
    }
    if (jobIndex !== undefined) declaration.jobIndex = jobIndex;
    if (description !== undefined) declaration.description = description.trim();
    if (receiptUrl !== undefined) declaration.receiptUrl = receiptUrl.trim();
    if (receiptName !== undefined) declaration.receiptName = receiptName.trim();

    const updated = await declaration.save();
    const populated = await Declaration.findById(updated._id)
      .populate('employeeId', 'username email role photo')
      .populate('reviewedBy', 'username email')
      .populate('paidBy', 'username email')
      .populate('jobId', 'index customer');

    res.status(200).json({
      success: true,
      message: 'Declaration updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error in updateDeclaration:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. DELETE DECLARATION
exports.deleteDeclaration = async (req, res) => {
  try {
    const { id } = req.params;
    const declaration = await Declaration.findById(id);

    if (!declaration) {
      return res.status(404).json({ success: false, message: 'Declaration not found' });
    }

    const { role, userId, isAdmin } = getUserContext(req);
    const isStaffOrAgent = !isAdmin;
    if (isStaffOrAgent && declaration.status !== 'Pending') {
      return res.status(403).json({
        success: false,
        message: 'You can only delete declarations that are in Pending status',
      });
    }

    await Declaration.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Declaration deleted successfully',
    });
  } catch (error) {
    console.error('Error in deleteDeclaration:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
