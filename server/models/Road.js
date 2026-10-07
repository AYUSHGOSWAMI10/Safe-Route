const mongoose = require("mongoose");

const roadSchema = new mongoose.Schema({
  source: { type: String, required: true },
  destination: { type: String, required: true },
  distance: { type: Number, required: true },
  estimatedTime: { type: Number, required: true },
  safetyScore: { type: Number, required: true, min: 0, max: 100 },
});

module.exports = mongoose.model("Road", roadSchema);
