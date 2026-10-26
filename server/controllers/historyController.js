const mongoose = require("mongoose");
const RouteHistory = require("../models/RouteHistory");

async function createHistory(req, res) {
  try {
    const {
      source,
      destination,
      preference = "balanced",
      selectedRoute,
      distance,
      estimatedTime,
      safetyScore,
    } = req.body;

    if (
      typeof source !== "string" ||
      typeof destination !== "string" ||
      typeof selectedRoute !== "string" ||
      !source.trim() ||
      !destination.trim() ||
      !selectedRoute.trim() ||
      source.trim() === destination.trim() ||
      source.length > 120 ||
      destination.length > 120 ||
      selectedRoute.length > 120 ||
      !["faster", "balanced", "safer"].includes(preference) ||
      typeof distance !== "number" ||
      !Number.isFinite(distance) ||
      distance < 0 ||
      typeof estimatedTime !== "number" ||
      !Number.isFinite(estimatedTime) ||
      estimatedTime < 0 ||
      typeof safetyScore !== "number" ||
      !Number.isFinite(safetyScore) ||
      safetyScore < 0 ||
      safetyScore > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid route history data.",
      });
    }

    const history = await RouteHistory.create({
      userId: req.userId,
      source: source.trim(),
      destination: destination.trim(),
      preference,
      selectedRoute: selectedRoute.trim(),
      distance,
      estimatedTime,
      safetyScore,
    });

    return res.status(201).json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Create route history failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to save route history.",
    });
  }
}

async function getHistory(req, res) {
  try {
    const history = await RouteHistory.find({
      userId: req.userId,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Read route history failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load route history.",
    });
  }
}

async function getHistoryById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({
      success: false,
      message: "Route history not found.",
    });
  }

  try {
    const history = await RouteHistory.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).lean();

    if (!history) {
      return res.status(404).json({
        success: false,
        message: "Route history not found.",
      });
    }

    return res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Read route history item failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load route history.",
    });
  }
}

module.exports = {
  createHistory,
  getHistory,
  getHistoryById,
};
