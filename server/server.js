require("dotenv").config({ path: `${__dirname}/.env` });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Road = require("./models/Road");
const sampleRoads = require("./data/sampleRoads");
const routeRoutes = require("./routes/routeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthRoutes");
const historyRoutes = require("./routes/historyRoutes");

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