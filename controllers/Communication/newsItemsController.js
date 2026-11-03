const NewsItems = require("../../models/Communication/newsItems");
const { ObjectId } = require("mongodb");

// Role authorization guard helper: Only Admin and Manager may author/modify announcements
function isAuthorizedPublisher(user) {
  const role = user?.role || '';
  return role === 'Admin' || role === 'Manager';
}

exports.createNewsItems = async (req, res) => {
  try {
    if (!isAuthorizedPublisher(req.user)) {
      return res.status(403).json({
        success: false,
        status: false,
        error: "FORBIDDEN",
        msg: "Only Admin or Manager can publish news announcements",
      });
    }

    const { title, body, publishAt } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 120) {
      return res.status(400).json({
        success: false,
        status: false,
        error: "VALIDATION_ERROR",
        msg: "Title is required and must be between 3 and 120 characters",
      });
    }

    if (!body || typeof body !== 'string' || body.trim().length < 5) {
      return res.status(400).json({
        success: false,
        status: false,
        error: "VALIDATION_ERROR",
        msg: "Body is required and must be at least 5 characters",
      });
    }

    const publisherName = req.user?.name ||
      req.user?.fullName ||
      `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() ||
      'Management';

    const newsItem = new NewsItems({
      title: title.trim(),
      body: body.trim(),
      publishAt: publishAt ? new Date(publishAt) : new Date(),
      employeeId: String(req.user?.id || req.user?._id || ''),
      publisherName,
    });

    const result = await newsItem.save();
    return res.status(200).json({
      success: true,
      status: true,
      msg: "data is successfully create!",
      data: result,
    });
  } catch (err) {
    console.error("[createNewsItems error]", err);
    return res.status(500).json({
      success: false,
      status: false,
      error: "SERVER_ERROR",
      msg: err.message,
    });
  }
};

exports.editNewsItem = async (req, res) => {
  try {
    if (!isAuthorizedPublisher(req.user)) {
      return res.status(403).json({
        success: false,
        status: false,
        error: "FORBIDDEN",
        msg: "Only Admin or Manager can edit news announcements",
      });
    }

    const newsId = req.params.newsItemId || req.body._id;
    if (!newsId) {
      return res.status(400).json({
        success: false,
        status: false,
        error: "VALIDATION_ERROR",
        msg: "News item ID is required",
      });
    }

    const target = await NewsItems.findById(newsId);
    if (!target) {
      return res.status(404).json({
        success: false,
        status: false,
        msg: "newsItem is not found",
        data: null,
      });
    }

    const updatePayload = {};
    if (req.body.title !== undefined) updatePayload.title = String(req.body.title).trim();
    if (req.body.body !== undefined) updatePayload.body = String(req.body.body).trim();
    if (req.body.publishAt !== undefined) updatePayload.publishAt = new Date(req.body.publishAt);

    // Update editor attribution
    const editorName = req.user?.name ||
      req.user?.fullName ||
      `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() ||
      target.publisherName;
    updatePayload.publisherName = editorName;

    const editedData = await NewsItems.findByIdAndUpdate(
      target._id,
      { $set: updatePayload },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      status: true,
      msg: "edit data is Successfully",
      data: editedData,
    });
  } catch (err) {
    console.error("[editNewsItem error]", err);
    return res.status(500).json({
      success: false,
      status: false,
      error: "SERVER_ERROR",
      msg: err.message,
    });
  }
};

exports.newsItemsList = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 10);
    const userRole = req.user?.role || 'Staff';

    const filter = {};
    // Non-admin / non-manager users can only see news that has reached publishAt
    if (userRole !== 'Admin' && userRole !== 'Manager') {
      filter.publishAt = { $lte: new Date() };
    }

    const totalNewsItem = await NewsItems.countDocuments(filter);
    const newsItemsList = await NewsItems.find(filter)
      .sort({ publishAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    return res.status(200).json({
      success: true,
      totalNewsItem,
      currentPage: page,
      totalPages: Math.ceil(totalNewsItem / pageSize),
      newsItemsList,
    });
  } catch (err) {
    console.error("[newsItemsList error]", err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.deleteNewsItem = async (req, res) => {
  try {
    if (!isAuthorizedPublisher(req.user)) {
      return res.status(403).json({
        success: false,
        status: false,
        error: "FORBIDDEN",
        msg: "Only Admin or Manager can delete news announcements",
      });
    }

    const newsItemId = req.params.newsItemId || req.body._id;
    const dataCheck = await NewsItems.findById(newsItemId);

    if (dataCheck) {
      const deletedData = await NewsItems.findByIdAndDelete(dataCheck._id);
      return res.status(200).json({
        success: true,
        status: true,
        msg: "DATA is successfully deleted",
        data: deletedData,
      });
    } else {
      return res.status(404).json({
        success: false,
        status: false,
        msg: "newsItem is not found",
        data: null,
      });
    }
  } catch (err) {
    console.error("[deleteNewsItem error]", err);
    return res.status(500).json({
      success: false,
      status: false,
      msg: "Internal server error",
      data: null,
      error: err.message,
    });
  }
};
