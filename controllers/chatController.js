// controllers/chatController.js
const Chat = require('../models/chat');

exports.chat = async (req, res) => {
  try {
    // const { message, sender } = req.body;
    const { message: msg, sender } = JSON.parse(message);
    if (!message || !sender) {
      return res.status(400).json({ message: 'Message and sender are required.' });
    }

    const newMessage = new Chat({ message, sender });
    await newMessage.save();

    // Broadcast the new message to all connected clients via WebSocket
    req.server.locals.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(newMessage));
      }
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error('Invalid JSON received:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
