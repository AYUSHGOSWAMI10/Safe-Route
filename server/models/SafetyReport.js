const mongoose = require("mongoose");

const safetyReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "Poor lighting",
        "Unsafe road",
        "Isolated area",
        "Suspicious activity",
        "Other",
      ],
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    moderationNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

safetyReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("SafetyReport", safetyReportSchema);