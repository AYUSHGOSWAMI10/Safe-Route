require("dotenv").config({ path: `${__dirname}/.env` });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Road = require("./models/Road");
const sampleRoads = require("./data/sampleRoads");
const routeRoutes = require("./routes/routeRoutes");

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());
app.use("/api/routes", routeRoutes);

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

app.listen(port, () => {
  console.log(`SafeRoute API running at http://localhost:${port}`);
  connectToMongo();
});
