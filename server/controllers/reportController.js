const mongoose = require("mongoose");
const SafetyReport = require("../models/SafetyReport");

const CATEGORIES = [
  "Poor lighting",
  "Unsafe road",
  "Isolated area",
  "Suspicious activity",
  "Other",
];

function serializeReport(report) {
  return {
    id: report._id,
    category: report.category,
    location: report.location,
    description: report.description,
    status: report.status,
    moderationNote: report.moderationNote || "",
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

async function createReport(req, res) {
  try {
    if (req.isDemo || !mongoose.isValidObjectId(req.userId)) {
      return res.status(403).json({
        error: "Demo accounts cannot submit persistent reports.",
      });
    }

    const { category, location, description } = req.body || {};

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Choose a valid category." });
    }

    if (
      typeof location !== "string" ||
      !location.trim() ||
      location.trim().length > 200
    ) {
      return res.status(400).json({
        error: "Location is required (maximum 200 characters).",
      });
    }

    if (
      typeof description !== "string" ||
      description.trim().length < 10 ||
      description.trim().length > 1000
    ) {
      return res.status(400).json({
        error: "Description must be 10–1000 characters.",
      });
    }

    const report = await SafetyReport.create({
      userId: req.userId,
      category,
      location: location.trim(),
      description: description.trim(),
    });

    return res.status(201).json({
      report: serializeReport(report),
    });
  } catch (error) {
    console.error("createReport:", error);
    return res.status(500).json({
      error: "Could not submit report.",
    });
  }
}

async function getMyReports(req, res) {
  try {
    if (req.isDemo || !mongoose.isValidObjectId(req.userId)) {
      return res.json({ reports: [] });
    }

    const reports = await SafetyReport.find({
      userId: req.userId,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      reports: reports.map(serializeReport),
    });
  } catch (error) {
    console.error("getMyReports:", error);
    return res.status(500).json({
      error: "Could not load your reports.",
    });
  }
}

async function getAllReports(req, res) {
  try {
    const reports = await SafetyReport.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("userId", "name email")
      .lean();

    return res.json({
      reports: reports.map((report) => ({
        ...serializeReport(report),
        user: report.userId
          ? {
              name: report.userId.name,
              email: report.userId.email,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("getAllReports:", error);
    return res.status(500).json({
      error: "Could not load reports.",
    });
  }
}

async function moderateReport(req, res) {
  try {
    const { status, moderationNote = "" } = req.body || {};

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        error: "Status must be approved or rejected.",
      });
    }

    if (
      typeof moderationNote !== "string" ||
      moderationNote.trim().length > 500
    ) {
      return res.status(400).json({
        error: "Moderation note must be 500 characters or fewer.",
      });
    }

    const report = await SafetyReport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status,
          moderationNote: moderationNote.trim(),
          moderatedBy: req.userId,
          moderatedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!report) {
      return res.status(404).json({ error: "Report not found." });
    }

    return res.json({
      report: serializeReport(report),
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid report ID." });
    }

    console.error("moderateReport:", error);
    return res.status(500).json({
      error: "Could not moderate report.",
    });
  }
}

module.exports = {
  createReport,
  getMyReports,
  getAllReports,
  moderateReport,
};