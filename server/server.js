require("dotenv").config({ path: `${__dirname}/.env` });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Road = require("./models/Road");
const Region = require("./models/Region");
const sampleRoads = require("./data/sampleRoads");
const routeRoutes = require("./routes/routeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthRoutes");
const historyRoutes = require("./routes/historyRoutes");
const { createRegionRoutes } = require("./routes/regionRoutes");
const { regionRegistry } = require("./data/ingest/regionRegistry");
const reportRoutes = require("./routes/reportRoutes");
const adminReportRoutes = require("./routes/adminReportRoutes");

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/regions", createRegionRoutes(regionRegistry));
app.use("/api/reports", reportRoutes);
app.use("/api/admin/reports", adminReportRoutes);

async function connectToMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("MONGODB_URI is not set. Using sample roads.");
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log("Connected to MongoDB.");
    if (await Road.countDocuments() === 0) {
      await Road.insertMany(sampleRoads);
      console.log("Added sample roads to MongoDB.");
    }

    // Initialize regional graph registry
    await regionRegistry.init(Region);
    console.log("Regional graph registry initialized.");
  } catch (error) {
    console.log("MongoDB is unavailable. Using sample roads.");
  }
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`SafeRoute API running at http://localhost:${port}`);
    connectToMongo();
  });
}

module.exports = { app, connectToMongo };