const mongoose = require("mongoose");

const routeHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    preference: {
      type: String,
      enum: ["faster", "balanced", "safer"],
      default: "balanced",
      required: true,
    },
    selectedRoute: {
      type: String,
      required: true,
      maxlength: 120,
    },
    distance: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedTime: {
      type: Number,
      required: true,
      min: 0,
    },
    safetyScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

routeHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("RouteHistory", routeHistorySchema);
