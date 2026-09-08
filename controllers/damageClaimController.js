const DamageClaim = require('../models/damageClaimModel');
const jobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const User = require('../models/user');

const getUserContext = (req) => {
  const user = req.user || {};
  const role = user.role || 'Staff';
  const userId = user._id || user.id || null;
  const username = user.username || user.name || 'Admin / User';
  const isAdmin = role === 'Admin';
  return { role, userId, username, isAdmin };
};

// 1. GET ALL DAMAGE CLAIMS WITH SUMMARY KPI METRICS
exports.getDamageClaims = async (req, res) => {
  try {
    const {
      status,
      incidentStage,
      insuranceType,
      startDate,
      endDate,
      search,
      jobId,
      customerId,
    } = req.query;

    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (incidentStage && incidentStage !== 'All') {
      filter.incidentStage = incidentStage;
    }

    if (insuranceType && insuranceType !== 'All') {
      filter.insuranceType = insuranceType;
    }

    if (jobId) {
      filter.jobId = jobId;
    }

    if (customerId) {
      filter.customerId = customerId;
    }

    if (startDate || endDate) {
      filter.incidentDate = {};
      if (startDate) {
        filter.incidentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        filter.incidentDate.$lte = eDate;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { claimNumber: regex },
        { customerName: regex },
        { customerEmail: regex },
        { customerPhone: regex },
        { jobIndex: regex },
        { incidentDescription: regex },
        { incidentLocation: regex },
        { 'items.itemName': regex },
      ];
    }

    // Fetch matching claims
    const claims = await DamageClaim.find(filter)
      .populate('jobId', 'index date load unload relocation status')
      .populate('customerId', 'name email phone contactAddress')
      .populate('reviewedBy', 'username email role')
      .populate('settledBy', 'username email role')
      .sort({ createdAt: -1 });

    // Compute Overall Summary KPIs (from all claims matching base date/job/customer if any)
    const baseFilter = {};
    if (startDate || endDate) {
      baseFilter.incidentDate = filter.incidentDate;
    }
    if (jobId) baseFilter.jobId = jobId;
    if (customerId) baseFilter.customerId = customerId;

    const allMatchingClaims = await DamageClaim.find(baseFilter).select(
      'status totalClaimedAmount totalApprovedAmount netSettlementAmount deductibleApplied'
    );

    let totalClaimsCount = 0;
    let totalClaimedAmount = 0;
    let totalApprovedAmount = 0;
    let totalSettledAmount = 0;
    let totalDeductibleAmount = 0;

    let reportedCount = 0;
    let underReviewCount = 0;
    let inspectionScheduledCount = 0;
    let approvedCount = 0;
    let partiallyApprovedCount = 0;
    let settledCount = 0;
    let rejectedCount = 0;
    let closedCount = 0;

    allMatchingClaims.forEach((c) => {
      totalClaimsCount += 1;
      totalClaimedAmount += Number(c.totalClaimedAmount || 0);
      totalApprovedAmount += Number(c.totalApprovedAmount || 0);
      totalDeductibleAmount += Number(c.deductibleApplied || 0);

      if (c.status === 'Settled' || c.status === 'Closed') {
        totalSettledAmount += Number(c.netSettlementAmount || c.totalApprovedAmount || 0);
      }

      switch (c.status) {
        case 'Reported':
          reportedCount += 1;
          break;
        case 'Under Review':
          underReviewCount += 1;
          break;
        case 'Inspection Scheduled':
          inspectionScheduledCount += 1;
          break;
        case 'Approved':
          approvedCount += 1;
          break;
        case 'Partially Approved':
          partiallyApprovedCount += 1;
          break;
        case 'Settled':
          settledCount += 1;
          break;
        case 'Rejected':
          rejectedCount += 1;
          break;
        case 'Closed':
          closedCount += 1;
          break;
        default:
          break;
      }
    });

    res.status(200).json({
      success: true,
      data: claims,
      summary: {
        totalClaimsCount,
        totalClaimedAmount: Number(totalClaimedAmount.toFixed(2)),
        totalApprovedAmount: Number(totalApprovedAmount.toFixed(2)),
        totalSettledAmount: Number(totalSettledAmount.toFixed(2)),
        totalDeductibleAmount: Number(totalDeductibleAmount.toFixed(2)),
        activeReviewCount: reportedCount + underReviewCount + inspectionScheduledCount,
        reportedCount,
        underReviewCount,
        inspectionScheduledCount,
        approvedCount: approvedCount + partiallyApprovedCount,
        settledCount,
        rejectedCount,
        closedCount,
      },
    });
  } catch (error) {
    console.error('Error in getDamageClaims:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. GET SINGLE DAMAGE CLAIM BY ID
exports.getDamageClaimById = async (req, res) => {
  try {
    const { id } = req.params;
    const claim = await DamageClaim.findById(id)
      .populate('jobId', 'index date load unload relocation services status')
      .populate('customerId', 'name email phone contactAddress')
      .populate('reviewedBy', 'username email role')
      .populate('settledBy', 'username email role')
      .populate('statusHistory.changedBy', 'username email role');

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Damage claim not found' });
    }

    res.status(200).json({ success: true, data: claim });
  } catch (error) {
    console.error('Error in getDamageClaimById:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. CREATE NEW DAMAGE CLAIM
exports.createDamageClaim = async (req, res) => {
  try {
    const { userId, username } = getUserContext(req);
    const {
      jobId,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      reportedBy,
      reportedByName,
      incidentDate,
      incidentStage,
      incidentLocation,
      incidentDescription,
      items,
      insuranceType,
      policyNumber,
      deductibleAmount,
    } = req.body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one damaged item is required' });
    }

    // Format item entries & calculate total claimed
    let calculatedTotalClaimed = 0;
    const formattedItems = items.map((it) => {
      const itClaimAmt = parseFloat(it.claimedAmount) || 0;
      calculatedTotalClaimed += itClaimAmt;
      return {
        itemName: (it.itemName || '').trim(),
        itemCategory: it.itemCategory || 'Furniture',
        damageType: it.damageType || 'Scratch / Dent',
        quantity: parseInt(it.quantity, 10) || 1,
        estimatedOriginalValue: parseFloat(it.estimatedOriginalValue) || 0,
        claimedAmount: itClaimAmt,
        approvedAmount: parseFloat(it.approvedAmount) || 0,
        evidencePhotos: Array.isArray(it.evidencePhotos) ? it.evidencePhotos : [],
        repairQuoteUrl: (it.repairQuoteUrl || '').trim(),
        notes: (it.notes || '').trim(),
      };
    });

    // Lookup Job index if jobId provided
    let resolvedJobIndex = '';
    if (jobId) {
      const jobDoc = await jobSchedule.findById(jobId).select('index');
      if (jobDoc) resolvedJobIndex = jobDoc.index;
    }

    const newClaim = new DamageClaim({
      jobId: jobId || null,
      jobIndex: resolvedJobIndex,
      customerId: customerId || null,
      customerName: customerName.trim(),
      customerEmail: (customerEmail || '').trim(),
      customerPhone: (customerPhone || '').trim(),
      reportedBy: reportedBy || 'Customer',
      reportedByName: (reportedByName || username || 'Customer').trim(),
      incidentDate: incidentDate ? new Date(incidentDate) : new Date(),
      reportedDate: new Date(),
      incidentStage: incidentStage || 'Loading / In-Transit',
      incidentLocation: (incidentLocation || '').trim(),
      incidentDescription: (incidentDescription || '').trim(),
      items: formattedItems,
      insuranceType: insuranceType || 'Standard Transit Liability',
      policyNumber: (policyNumber || '').trim(),
      deductibleAmount: parseFloat(deductibleAmount) || 0,
      totalClaimedAmount: Number(calculatedTotalClaimed.toFixed(2)),
      totalApprovedAmount: 0,
      deductibleApplied: 0,
      netSettlementAmount: 0,
      status: 'Reported',
      statusHistory: [
        {
          status: 'Reported',
          changedBy: userId || null,
          changedByName: username || 'Reporter',
          timestamp: new Date(),
          comment: 'Damage claim initially reported and logged.',
          action: 'Claim Filed',
        },
      ],
    });

    const saved = await newClaim.save();

    const populated = await DamageClaim.findById(saved._id)
      .populate('jobId', 'index date load unload relocation')
      .populate('customerId', 'name email phone contactAddress');

    res.status(201).json({
      success: true,
      message: `Damage claim ${saved.claimNumber || ''} created successfully`,
      data: populated,
    });
  } catch (error) {
    console.error('Error in createDamageClaim:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UPDATE DAMAGE CLAIM DETAILS
exports.updateDamageClaim = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, username } = getUserContext(req);

    const claim = await DamageClaim.findById(id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Damage claim not found' });
    }

    if (claim.status === 'Settled' || claim.status === 'Closed') {
      return res.status(403).json({
        success: false,
        message: `Claim is currently ${claim.status}. Please reopen or change status to edit details.`,
      });
    }

    const {
      jobId,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      incidentDate,
      incidentStage,
      incidentLocation,
      incidentDescription,
      items,
      insuranceType,
      policyNumber,
      deductibleAmount,
    } = req.body;

    if (customerName) claim.customerName = customerName.trim();
    if (customerEmail !== undefined) claim.customerEmail = customerEmail.trim();
    if (customerPhone !== undefined) claim.customerPhone = customerPhone.trim();
    if (incidentDate) claim.incidentDate = new Date(incidentDate);
    if (incidentStage) claim.incidentStage = incidentStage;
    if (incidentLocation !== undefined) claim.incidentLocation = incidentLocation.trim();
    if (incidentDescription !== undefined) claim.incidentDescription = incidentDescription.trim();
    if (insuranceType) claim.insuranceType = insuranceType;
    if (policyNumber !== undefined) claim.policyNumber = policyNumber.trim();
    if (deductibleAmount !== undefined) claim.deductibleAmount = parseFloat(deductibleAmount) || 0;

    if (jobId !== undefined) {
      claim.jobId = jobId || null;
      if (jobId) {
        const jobDoc = await jobSchedule.findById(jobId).select('index');
        if (jobDoc) claim.jobIndex = jobDoc.index;
      } else {
        claim.jobIndex = '';
      }
    }

    if (customerId !== undefined) {
      claim.customerId = customerId || null;
    }

    if (items && Array.isArray(items) && items.length > 0) {
      let calcClaimed = 0;
      let calcApproved = 0;

      claim.items = items.map((it) => {
        const itClaimAmt = parseFloat(it.claimedAmount) || 0;
        const itAppAmt = parseFloat(it.approvedAmount) || 0;
        calcClaimed += itClaimAmt;
        calcApproved += itAppAmt;
        return {
          itemName: (it.itemName || '').trim(),
          itemCategory: it.itemCategory || 'Furniture',
          damageType: it.damageType || 'Scratch / Dent',
          quantity: parseInt(it.quantity, 10) || 1,
          estimatedOriginalValue: parseFloat(it.estimatedOriginalValue) || 0,
          claimedAmount: itClaimAmt,
          approvedAmount: itAppAmt,
          evidencePhotos: Array.isArray(it.evidencePhotos) ? it.evidencePhotos : [],
          repairQuoteUrl: (it.repairQuoteUrl || '').trim(),
          notes: (it.notes || '').trim(),
        };
      });

      claim.totalClaimedAmount = Number(calcClaimed.toFixed(2));
      if (calcApproved > 0) {
        claim.totalApprovedAmount = Number(calcApproved.toFixed(2));
        const net = Math.max(0, calcApproved - (claim.deductibleApplied || 0));
        claim.netSettlementAmount = Number(net.toFixed(2));
      }
    }

    claim.statusHistory.push({
      status: claim.status,
      changedBy: userId || null,
      changedByName: username || 'User',
      timestamp: new Date(),
      comment: 'Claim details & damaged items updated',
      action: 'Details Modified',
    });

    const updated = await claim.save();

    const populated = await DamageClaim.findById(updated._id)
      .populate('jobId', 'index date load unload relocation')
      .populate('customerId', 'name email phone contactAddress')
      .populate('reviewedBy', 'username email role')
      .populate('settledBy', 'username email role');

    res.status(200).json({
      success: true,
      message: 'Damage claim updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error in updateDamageClaim:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. UPDATE STATUS & SETTLEMENT WORKFLOW
exports.updateClaimStatusAndSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, username } = getUserContext(req);

    const claim = await DamageClaim.findById(id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Damage claim not found' });
    }

    const {
      status,
      reviewerComment,
      totalApprovedAmount,
      deductibleApplied,
      settlementType,
      paymentReference,
      settlementNotes,
      releaseAgreementSigned,
      releaseDocumentUrl,
      rejectionReason,
      itemApprovedAmounts,
    } = req.body;

    const previousStatus = claim.status;

    if (status) {
      claim.status = status;
    }

    claim.reviewedBy = userId || null;
    claim.reviewedByName = username || 'Reviewer';
    claim.reviewedAt = new Date();

    if (reviewerComment !== undefined) {
      claim.reviewerComment = reviewerComment.trim();
    }

    // Handle Item level approvals if supplied
    if (itemApprovedAmounts && typeof itemApprovedAmounts === 'object') {
      let sumApproved = 0;
      claim.items.forEach((it) => {
        if (itemApprovedAmounts[it._id]) {
          it.approvedAmount = parseFloat(itemApprovedAmounts[it._id]) || 0;
        }
        sumApproved += it.approvedAmount || 0;
      });
      if (sumApproved > 0 && totalApprovedAmount === undefined) {
        claim.totalApprovedAmount = Number(sumApproved.toFixed(2));
      }
    }

    // Handle Financials if approving or settling
    if (
      status === 'Approved' ||
      status === 'Partially Approved' ||
      status === 'Settled'
    ) {
      if (totalApprovedAmount !== undefined) {
        claim.totalApprovedAmount = parseFloat(totalApprovedAmount) || 0;
      }
      if (deductibleApplied !== undefined) {
        claim.deductibleApplied = parseFloat(deductibleApplied) || 0;
      }

      const net = Math.max(
        0,
        (claim.totalApprovedAmount || 0) - (claim.deductibleApplied || 0)
      );
      claim.netSettlementAmount = Number(net.toFixed(2));
    }

    // Handle Settlement Execution
    if (status === 'Settled') {
      claim.settlementStatus = 'Settled';
      claim.settlementType = settlementType || 'Direct Bank Transfer';
      claim.settlementDate = new Date();
      claim.paymentReference = (paymentReference || '').trim();
      claim.settledBy = userId || null;
      claim.settledByName = username || 'Admin';
      claim.settlementNotes = (settlementNotes || '').trim();
      if (releaseAgreementSigned !== undefined) {
        claim.releaseAgreementSigned = Boolean(releaseAgreementSigned);
      }
      if (releaseDocumentUrl) {
        claim.releaseDocumentUrl = releaseDocumentUrl.trim();
      }
    } else if (status === 'Rejected') {
      claim.rejectionReason = (rejectionReason || reviewerComment || '').trim();
      claim.settlementStatus = 'Unsettled';
      claim.netSettlementAmount = 0;
    }

    // Record Status History entry
    claim.statusHistory.push({
      status: claim.status,
      changedBy: userId || null,
      changedByName: username || 'Manager',
      timestamp: new Date(),
      comment: reviewerComment || settlementNotes || rejectionReason || `Status changed from ${previousStatus} to ${claim.status}`,
      action: status === 'Settled' ? 'Claim Settled & Disbursed' : `Status Updated: ${claim.status}`,
    });

    const saved = await claim.save();

    const populated = await DamageClaim.findById(saved._id)
      .populate('jobId', 'index date load unload relocation')
      .populate('customerId', 'name email phone contactAddress')
      .populate('reviewedBy', 'username email role')
      .populate('settledBy', 'username email role')
      .populate('statusHistory.changedBy', 'username email role');

    res.status(200).json({
      success: true,
      message: `Claim status updated to ${claim.status}`,
      data: populated,
    });
  } catch (error) {
    console.error('Error in updateClaimStatusAndSettlement:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. DELETE DAMAGE CLAIM
exports.deleteDamageClaim = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin } = getUserContext(req);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only Administrators can delete damage claims',
      });
    }

    const claim = await DamageClaim.findByIdAndDelete(id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Damage claim not found' });
    }

    res.status(200).json({
      success: true,
      message: `Damage claim ${claim.claimNumber || ''} deleted successfully`,
    });
  } catch (error) {
    console.error('Error in deleteDamageClaim:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. EXPORT CLAIMS CSV
exports.exportClaimsCSV = async (req, res) => {
  try {
    const claims = await DamageClaim.find()
      .populate('jobId', 'index')
      .populate('customerId', 'name email phone')
      .sort({ createdAt: -1 });

    const headers = [
      'Claim Number',
      'Reported Date',
      'Incident Date',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Job Reference',
      'Incident Stage',
      'Incident Location',
      'Damaged Items Count',
      'Total Claimed Amount (EUR)',
      'Total Approved Amount (EUR)',
      'Deductible Applied (EUR)',
      'Net Settlement Amount (EUR)',
      'Settlement Status',
      'Settlement Type',
      'Payment Reference',
      'Claim Status',
    ];

    const rows = claims.map((c) => [
      `"${c.claimNumber || ''}"`,
      `"${c.reportedDate ? new Date(c.reportedDate).toISOString().split('T')[0] : ''}"`,
      `"${c.incidentDate ? new Date(c.incidentDate).toISOString().split('T')[0] : ''}"`,
      `"${(c.customerName || '').replace(/"/g, '""')}"`,
      `"${(c.customerEmail || '').replace(/"/g, '""')}"`,
      `"${(c.customerPhone || '').replace(/"/g, '""')}"`,
      `"${c.jobIndex || c.jobId?.index || ''}"`,
      `"${c.incidentStage || ''}"`,
      `"${(c.incidentLocation || '').replace(/"/g, '""')}"`,
      c.items?.length || 0,
      (c.totalClaimedAmount || 0).toFixed(2),
      (c.totalApprovedAmount || 0).toFixed(2),
      (c.deductibleApplied || 0).toFixed(2),
      (c.netSettlementAmount || 0).toFixed(2),
      `"${c.settlementStatus || 'Unsettled'}"`,
      `"${c.settlementType || 'None'}"`,
      `"${(c.paymentReference || '').replace(/"/g, '""')}"`,
      `"${c.status || 'Reported'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="damage_claims_${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error in exportClaimsCSV:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
