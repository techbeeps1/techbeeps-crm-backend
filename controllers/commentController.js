const Comments = require("../models/comment");

exports.comments = async (req, res) => {
  const {username} = req.user
  try {
    const comment = new Comments();
    comment.userId = req.body.userId
    comment.text = req.body.text
    comment.username = username
    const commentData = await comment.save();
    res.json(commentData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

exports.commentListById = async (req, res) => {
  try {
    const userId = req.params.userId;
    const comments = await Comments.find({ userId }).lean(); // Use .lean() to return plain objects
    res.json(comments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
