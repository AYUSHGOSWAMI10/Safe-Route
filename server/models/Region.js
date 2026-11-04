const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema(
  {
    regionCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
      description: "Unique region identifier (e.g., 'mathura', 'uttar-pradesh')",
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      description: "Human-readable region name",
    },
    bounds: {
      minLat: { type: Number, required: true, min: -90, max: 90 },
      maxLat: { type: Number, required: true, min: -90, max: 90 },
      minLng: { type: Number, required: true, min: -180, max: 180 },
      maxLng: { type: Number, required: true, min: -180, max: 180 },
    },
    version: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      description: "Graph data version (e.g., OSM extract date)",
    },
    sourceUrl: {
      type: String,
      trim: true,
      description: "Source URL of the OSM extract",
    },
    generatedAt: {
      type: Date,
      required: true,
      description: "When the graph was generated",
    },
    nodeCount: { type: Number, required: true, min: 0 },
    edgeCount: { type: Number, required: true, min: 0 },
    filePath: {
      type: String,
      required: true,
      trim: true,
      description: "Path to the processed graph JSON file",
    },
    isActive: {
      type: Boolean,
      default: true,
      description: "Whether this region is available for routing",
    },
  },
  { timestamps: true }
);

regionSchema.index({ regionCode: 1 }, { unique: true });
regionSchema.index({ isActive: 1 });

module.exports = mongoose.model("Region", regionSchema);