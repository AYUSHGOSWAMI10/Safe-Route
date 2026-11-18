const mongoose = require("mongoose");

const graphImportJobSchema = new mongoose.Schema(
  {
    regionCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 50,
    },
    operation: {
      type: String,
      enum: ["import", "refresh", "delete"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed"],
      default: "pending",
      required: true,
    },
    sourceUrl: {
      type: String,
      trim: true,
    },
    filePath: {
      type: String,
      trim: true,
    },
    nodeCount: {
      type: Number,
      min: 0,
    },
    edgeCount: {
      type: Number,
      min: 0,
    },
    error: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
graphImportJobSchema.index({ regionCode: 1, createdAt: -1 });
graphImportJobSchema.index({ status: 1 });
graphImportJobSchema.index({ startedBy: 1 });

module.exports = mongoose.model("GraphImportJob", graphImportJobSchema);