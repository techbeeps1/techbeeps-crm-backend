const NewsItems = require("../../models/Communication/newsItems");
const { ObjectId } = require("mongodb");

exports.createNewsItems = async (req, res) => {
  try {
    let newsItem = new NewsItems();
    newsItem.title = req.body.title;
    newsItem.body = req.body.body;
    newsItem.publishAt = req.body.publishAt;

    newsItem.save().then((result) => {
      res.status(200).json({
        msg: "data is successfully create!",
        data: result,
      });
    });
  } catch (err) {
    console.log(err);
  }
};

exports.editNewsItem = async (req, res) => {
  console.log("req body ==>",req.body)
  try {
    const checkId = await NewsItems.findById({ _id: new ObjectId(req.body._id )});
    if (checkId) {
      const editedata = await NewsItems.findByIdAndUpdate(
        req.body._id,
        req.body,
        { new: true }
      );
      console.log("edited data==>",editedata)
      if (editedata) {
        res.status(200).send({
          msg: "edit data is Successfully",
          data: editedata,
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
};

exports.newsItemsList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5;
    const sortField = 'type';

    const pipeline = [
      {
        $sort: { [sortField]: 1 },
      },
      {
        $skip: (page - 1) * pageSize,
      },
      {
        $limit: pageSize,
      },
    ];

    const newsItemsList = await NewsItems.aggregate(pipeline);

    // Count total documents
    const totalNewsItem = await NewsItems.countDocuments();

    res.json({
      totalNewsItem: totalNewsItem,
      currentPage: page,
      totalPages: Math.ceil(totalNewsItem / pageSize),
      newsItemsList: newsItemsList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteNewsItem = async (req, res) => {
  try {
    const newsItemId = req.params.newsItemId;

    const dataCheck = await NewsItems.findById(newsItemId);

    if (dataCheck) {
      const DeleteData = await NewsItems.findOneAndDelete(
        { _id: dataCheck._id },
        req.body
      );

      res
        .status(200)
        .send({
          status: true,
          msg: "DATA is successfully deleted",
          data: DeleteData,
        });
    } else {
      return res
        .status(404)
        .send({ status: false, msg: "newsItem is not found", data: null });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ status: false, msg: "Internal server error", data: null });
  }
};