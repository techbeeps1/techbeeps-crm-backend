const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Message = require('./models/Message');
const ws = require('ws');
const fs = require('fs');
const url = require('url');


dotenv.config();

const mongoUrl = process.env.MONGO_URI
// const mongoUrl = "mongodb://127.0.0.1:27017/userDB"
if (!mongoUrl) {
  console.log("MONGO_URL environment variable is not set")
  console.error("MONGO_URL environment variable is not set");
  process.exit(1); // Exit the process if the MONGO_URL is not set
}

mongoose.set('strictQuery', false);

async function connectToDatabase() {
  try {
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      retryWrites: true,
      serverSelectionTimeoutMS: 10000, // Increase timeout for server selection
      socketTimeoutMS: 45000, // Increase socket timeout
    });
    console.log("chat backend start");
  } catch (err) {
    console.error("Failed to connect to chat backend", err);
  }
}


const jwtSecret = process.env.JWT_SECRET;
const bcryptSalt = bcrypt.genSaltSync(10);

const app = express();
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(express.json());
app.use(cookieParser());

// Configure CORS
const allowedOrigins = [
  'http://localhost:5173',
  'https://universal-movers-front.vercel.app',
  'https://universal-movers-front-3wr2.vercel.app',
  'https://techbeepcrm.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow requests with no origin (like mobile apps or curl requests)
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

async function getUserDataFromtoken(req) {
  return new Promise((resolve, reject) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]; // Get the token part
      jwt.verify(token, jwtSecret, {}, (err, userData) => {
        if (err) {
          reject(new Error('Token verification failed'));
        } else {
          resolve(userData);
        }
      });
    } else {
      reject(new Error('No token provided'));
    }
  });
}

app.get('/chatBackend/test', (req, res) => {
  res.json('test ok on vercel');
});

app.get('/chatBackend/messages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await getUserDataFromtoken(req);
    const ourUserId = userData.userId;
    const messages = await Message.find({
      sender: { $in: [userId, ourUserId] },
      recipient: { $in: [userId, ourUserId] }
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
});

app.get('/chatBackend/people', async (req, res) => {
  const users = await User.find({}, { '_id': 1, username: 1 });
  res.json(users);
});

app.post('/chatBackend/manually_message', async (req, res) => {
  try {
    const messageData = req.body;
    const newMessage = new Message(messageData);
    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------unread message api  ------------------

app.get('/chatBackend/notifications', async (req, res) => {
  try {
    const userData = await getUserDataFromtoken(req);
    const unreadMessages = await Message.find({ recipient: userData.userId, read: false })
      .populate('sender', 'username')
      .sort({ createdAt: -1 });
    res.json(unreadMessages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --------------------------------------------------------mark as read api  ------------------

app.put('/chatBackend/messages/:messageId/markAsRead', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userData = await getUserDataFromtoken(req);
    const message = await Message.findOneAndUpdate(
      { _id: messageId, recipient: userData.userId },
      { read: true },
      { new: true }
    );
    if (!message) {
      return res.status(404).json({ message: 'Message not found or you are not authorized' });
    }
    res.json({ message: 'Message marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/chatBackend/profile', async (req, res) => {
  try {
    const userData = await getUserDataFromtoken(req);
    const user = await User.findById(userData.userId); // Use findById to get user by userId
    if (!user) {
      return res.status(404).json({ msg: 'User not found' }); // Use 404 for not found
    }
    return res.status(200).json(user);
  } catch (error) {
    if (error.message === 'No token provided') {
      return res.status(401).json({ error: 'No token provided' });
    }
    return res.status(403).json({ error: error.message });
  }
});

app.post('/chatBackend/login', async (req, res) => {
  const { username, password } = req.body;
  const foundUser = await User.findOne({ username });
  if (foundUser) {
    const passOk = bcrypt.compareSync(password, foundUser.password);
    if (passOk) {
      jwt.sign({ userId: foundUser._id, username }, jwtSecret, {}, (err, token) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to generate token' });
        }
        res.json({
          id: foundUser._id,
          token: token,
        });
      });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/chatBackend/logout', (req, res) => {
  res.cookie('token', '', { secure: true }).json('ok');
});

app.post('/chatBackend/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
    const createdUser = await User.create({
      username: username,
      password: hashedPassword,
    });
    jwt.sign({ userId: createdUser._id, username }, jwtSecret, {}, (err, token) => {
      if (err) throw err;
      res.cookie('token', token, { secure: true }).status(201).json({
        id: createdUser._id,
        token: token,
      });
    });
  } catch (err) {
    if (err) throw err;
    res.status(500).json('error');
  }
});



async function startServer() {
  try {
    await connectToDatabase();

    const server = app.listen(4040, () => {
      console.log("Server running on port 4040 🚀");
    });

   // const wss = new ws.WebSocketServer({ server });

    wss.on('connection', (connection, req) => {
      // tumhara websocket code same rahega
    });

  } catch (err) {
    console.error("Server startup failed:", err);
  }
}

startServer();

const wss = new ws.WebSocketServer({ server });
wss.on('connection', (connection, req) => {
  function notifyAboutOnlinePeople() {
    [...wss.clients].forEach(client => {
      client.send(JSON.stringify({
        online: [...wss.clients].map(c => ({ userId: c.userId, username: c.username })),
      }));
    });
  }
  connection.isAlive = true;
  connection.timer = setInterval(() => {
    connection.ping();
    connection.deathTimer = setTimeout(() => {
      connection.isAlive = false;
      clearInterval(connection.timer);
      connection.terminate();
      notifyAboutOnlinePeople();
      console.log('dead');
    }, 1000);
  }, 5000);

  connection.on('pong', () => {
    clearTimeout(connection.deathTimer);
  });
  const query = url.parse(req.url, true).query;
  // const cookies = req.headers.cookie;
  if (query) {
    const token = query.token;
    // console.log('Received token:', token);
    if (token) {
      jwt.verify(token, jwtSecret, {}, (err, userData) => {
        if (err) throw err;
        const { userId, username } = userData;
        connection.userId = userId;
        connection.username = username;
      });
    }
  }

  connection.on('message', async (message) => {
    const messageData = JSON.parse(message.toString());
    const { recipient, text, file, sender } = messageData;
    let filename = null;
    if (file) {
      console.log('size', file.data.length);
      const parts = file.name.split('.');
      const ext = parts[parts.length - 1];
      filename = Date.now() + '.' + ext;
      const path = __dirname + '/uploads/' + filename;
      const bufferData = new Buffer(file.data.split(',')[1], 'base64');
      fs.writeFile(path, bufferData, () => {
        console.log('file saved:' + path);
      });
    }

    if (recipient && (text || file)) {
      const messageDoc = await Message.create({
        sender: sender,
        recipient,
        text,
        file: file ? filename : null,
      });
      // console.log('created message',messageDoc);
      [...wss.clients]
        .filter(c => c.userId === recipient)
        .forEach(c => c.send(JSON.stringify({
          text,
          sender,
          recipient,
          file: file ? filename : null,
          _id: messageDoc._id,
        })));
    }
  });

  // notify everyone about online people (when someone connects)
  notifyAboutOnlinePeople();
});
