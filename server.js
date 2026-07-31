require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require('path');

const server = express();

const expressWs = require("express-ws");

const { getWss, applyTo } = expressWs(server);

const allowedOrigins = [
  'http://localhost:5173',
  'https://universal-movers-front.vercel.app',
  'https://universal-movers-front-3wr2.vercel.app',
  'https://techbeepcrm.netlify.app',
  'https://osnl-videos.s3.eu-north-1.amazonaws.com',
];

server.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

server.use(express.static('uploads'));
server.use(bodyParser.json());
// server.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const emailRoutes = require("./routes/emailRoutes");
const userRoutes = require("./routes/userRoutes");
const leadRoutes = require("./routes/leadRoutes");
const customerRoutes = require("./routes/customerRoutes");
//const chatRoutes = require("./routes/chatRoutes");
const financeRoutes = require("./routes/financeRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const uploadDocumentRoutes = require("./routes/uploadDocumentRoutes");
const logCommunicationRoutes = require("./routes/logCommunicationRoutes");
const jobScheduleRoutes = require("./routes/jobScheduleRoutes");
const reportingRoutes = require("./routes/reportingRoutes");
const emailTemplateRoutes = require("./routes/emailTemplateRoutes");
const commentRoutes = require("./routes/commentRoutes");
const wareHouseRoutes = require("./routes/Resources/wareHouseRoutes");
const movingBoxRoutes = require("./routes/Resources/movingBoxRoutes");
const materialStockRoutes = require("./routes/Resources/materialStockRoutes");
const materialSupplierRoutes = require("./routes/Resources/materialSupplierRoutes");
const staffRoutes = require("./routes/Resources/staffRoutes");
const teamRoutes = require("./routes/Resources/teamRoutes");
const vehicleRoutes = require("./routes/Resources/vehicleRoutes");
const storageLoactionRoutes = require("./routes/Resources/storageLoactionRoutes");
const storageRoutes = require("./routes/Resources/stroageRoutes");

//const quoteRoutes = require("./routes/FinanceInvoice/quoteRoutes");
const newsItemsRoutes = require("./routes/Communication/newsItemsRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const companyRoutes = require("./routes/companyRoutes");
const packageRoutes = require("./routes/packageRoutes");
const salesGroupRoutes = require("./routes/salesGroupRoutes");
const documentTemplateRoutes = require("./routes/documenttemplateRoutes");
const taskRoutes = require("./routes/taskRoutes");
const dynamicInputController = require('./routes/dynamicinputRoutes')
const appointmentRoutes = require("./routes/appointmentRoutes")
const activityRoutes = require("./routes/activityRoutes");
const appSettingsRoutes = require("./routes/appSettingRoutes")
const valuationRoutes = require('./routes/Valuation/valuationRoutes');
//const iconRoutes = require('./routes/Valuation/iconRoutes');

server.get("/", (req, res) => {
  res.send("Updated CRM backend is running on vercel");
});

// valuation routes 
server.use("/api", valuationRoutes);
//server.use('/api/icons', iconRoutes);

server.use("/api", documentTemplateRoutes);

// setting routes
server.use("/api", companyRoutes)
server.use("/api", appSettingsRoutes);

server.use("/api/task", taskRoutes);

// user routes
server.use("/user", userRoutes);
server.use("/email", emailRoutes)

server.use("/customer", customerRoutes);
server.use("/invoice", invoiceRoutes);
server.use("/api", paymentRoutes);
server.use('/api/packages', packageRoutes);
server.use("/api/sale_group", salesGroupRoutes);

server.use('/api/appointment', appointmentRoutes);
server.use("/api/activities", activityRoutes);
server.use("/api", teamRoutes);
server.use("/api/input", dynamicInputController);

//server.use("/quote", quoteRoutes);
server.use("/finance", financeRoutes);
server.use("/leads", leadRoutes);

server.use("/api", uploadDocumentRoutes);

server.use("/api", logCommunicationRoutes);
server.use("/api", jobScheduleRoutes);
server.use("/api", reportingRoutes);
server.use("/api", emailTemplateRoutes);
server.use("/api", commentRoutes);

// resources routes
server.use("/api", wareHouseRoutes);
server.use("/api", movingBoxRoutes);
server.use("/api", materialStockRoutes);
server.use("/api", materialSupplierRoutes);
server.use("/api", vehicleRoutes);
server.use("/api", storageLoactionRoutes);
server.use("/api", storageRoutes);

//server.use("/api", staffRoutes);
server.use('/Communication', newsItemsRoutes);


async function connectToMongoDB() {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      retryWrites: true,
      serverSelectionTimeoutMS: 10000, // Increase timeout for server selection
      socketTimeoutMS: 45000, // Increase socket timeout
    });
    console.log('Connected to MongoDB Atlas!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}


// async function main() {
//   await mongoose.connect("mongodb://127.0.0.1:27017/userDB", {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//     retryWrites: true,
//     serverSelectionTimeoutMS: 10000, // Increase timeout for server selection
//     socketTimeoutMS: 45000, // Increase socket timeout
//   });
//   console.log("db connected to localhost");
// }

// main().catch((err) => console.log(err));

async function startServer() {
  try {
    await connectToMongoDB();

    server.listen(8080, () => {
      console.log("Server started on port 8080");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

startServer();
