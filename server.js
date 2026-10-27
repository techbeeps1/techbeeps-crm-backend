const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

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
  if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID, X-Idempotency-Key, X-Allow-Duplicate');
  res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-ID, X-Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Health check endpoint for frontend connectivity probe & uptime monitoring
server.get('/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date().toISOString() }));
server.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date().toISOString() }));

const { correlationMiddleware } = require("./middlewares/correlationMiddleware");
server.use(correlationMiddleware);

server.use('/uploads', express.static(path.join(__dirname, 'uploads')));
server.use(express.static(path.join(__dirname, 'uploads')));
server.use(bodyParser.json({ limit: '50mb' }));
server.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Register all core Mongoose models to prevent MissingSchemaError on cross-model populate
require("./models/customer");
require("./models/addressModel");
require("./models/user");
require("./models/PackageModel");
require("./models/documentTemplateModel");
require("./models/jobSchedule");
require("./models/salesgroupModel");
require("./models/invoice");
require("./models/finance");
require("./models/companyModel");
require("./models/appSettingModel");

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
const employabilityRoutes = require("./routes/employabilityRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const hoursRoutes = require("./routes/hoursRoutes");
const declarationRoutes = require("./routes/declarationRoutes");
const damageClaimRoutes = require("./routes/damageClaimRoutes");
const authMiddleware = require("./middlewares/authMiddlerware");


server.get("/", (req, res) => {
  res.send("Updated CRM backend is running on vercel");
});

server.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date() });
});

// valuation routes 
server.use("/api", valuationRoutes);
//server.use('/api/icons', iconRoutes);

server.use("/api", documentTemplateRoutes);

// setting routes
server.use("/api", companyRoutes)
server.use("/api", appSettingsRoutes);

server.use("/api/task", authMiddleware, taskRoutes);

// user routes
server.use("/user", userRoutes);
server.use("/email", emailRoutes)

server.use("/customer", authMiddleware, customerRoutes);
server.use("/invoice", authMiddleware, invoiceRoutes);
server.use("/api", paymentRoutes);
server.use('/api/packages', packageRoutes);
server.use("/api/sale_group", salesGroupRoutes);

server.use('/api/appointment', authMiddleware, appointmentRoutes);
server.use('/api/employability', authMiddleware, employabilityRoutes);
server.use('/api/leave', authMiddleware, leaveRoutes);
server.use('/api/availability', authMiddleware, availabilityRoutes);
server.use('/api/hours', authMiddleware, hoursRoutes);
server.use('/api/declarations', authMiddleware, declarationRoutes);
server.use('/api/damage-claims', authMiddleware, damageClaimRoutes);

server.use("/api/activities", activityRoutes);
server.use("/api", authMiddleware, teamRoutes);
server.use("/api/input", dynamicInputController);

//server.use("/quote", quoteRoutes);
server.use("/finance", financeRoutes);
server.use("/leads", authMiddleware, leadRoutes);

server.use("/api", uploadDocumentRoutes);

server.use("/api", logCommunicationRoutes);
server.use("/api", jobScheduleRoutes);
server.use("/api", reportingRoutes);
server.use("/api", emailTemplateRoutes);
server.use("/api", commentRoutes);

// resources routes (authenticated internal operations)
server.use("/api", authMiddleware, wareHouseRoutes);
server.use("/api", authMiddleware, movingBoxRoutes);
server.use("/api", authMiddleware, materialStockRoutes);
server.use("/api", authMiddleware, materialSupplierRoutes);
server.use("/api", authMiddleware, vehicleRoutes);
server.use("/api", authMiddleware, storageLoactionRoutes);
server.use("/api", authMiddleware, storageRoutes);


//server.use("/api", staffRoutes);
server.use('/Communication', authMiddleware, newsItemsRoutes);

// EXEC-09: Centralized API 404 handler for unknown endpoints
server.use((req, res, next) => {
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || null;
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `API endpoint '${req.method} ${req.originalUrl}' not found`,
    correlationId,
  });
});

// EXEC-09: Centralized Safe Error Middleware (Prevents raw stack and DB query leakage)
server.use((err, req, res, next) => {
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || null;
  console.error(`[EXEC-09 SafeError] [CorrelationId: ${correlationId}]`, err);

  const statusCode = err.statusCode || err.status || (err.name === 'ValidationError' ? 400 : 500);
  const safeMessage = (statusCode < 500 || err.name === 'ValidationError')
    ? err.message
    : (process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please contact support with your correlation ID.'
        : err.message || 'Internal server error');

  res.status(statusCode).json({
    error: err.name || 'INTERNAL_ERROR',
    message: safeMessage,
    correlationId,
  });
});

async function connectToMongoDB() {
  try {
    const dns = require('dns');
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    await mongoose.connect(mongoURI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
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
    server.listen(8080, () => {
      console.log("Server started on port 8080");
    });
    await connectToMongoDB();
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = server;
