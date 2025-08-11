const { default: exports } = require("three/examples/jsm/libs/tween.module.js");
const redisClient = require("../config/redis");
const Usage = require("../models/usageLogModel");

exports.getUserUsageSummary = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    const cacheKey = `usage:${userId}`;

    // Redis usage check
    const usageData = await redisClient.get(cacheKey);

    if (usageData) {
      const userUsage = JSON.parse(usageData);
      const totalQuota = userUsage.totalQuota;
      const usedData = userUsage.usedData;

      const currentData = totalQuota - usedData;

      return res.status(200).json({
        status: "success",
        data: {
          totalQuota,
          usedData,
          remainingData: currentData,
        },
        source: "redis",
      });
    }

    // If not in Redis, get from DB (example)
    const dbUsage = await UsageData.findOne({ userId });
    if (!dbUsage) {
      return res.status(404).json({
        status: "fail",
        message: "No usage data found",
      });
    }

    const remainingData = dbUsage.remainingData();

    return res.status(200).json({
      status: "success",
      data: {
        totalQuota: dbUsage.totalQuota,
        usedData: dbUsage.usedData,
        remainingData,
      },
      source: "database",
    });
  } catch (error) {
    console.error("Error fetching user usage summary:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};
// 2. getAllUsersUsageStats
exports.getAllUsersUsageStats = async (req, res) => {
  try {
    // Aggregate usage data from all users
    const stats = await UsageData.aggregate([
      {
        $group: {
          _id: null,
          totalQuota: { $sum: "$totalQuota" },
          totalUsedData: { $sum: "$usedData" },
          avgQuota: { $avg: "$totalQuota" },
          avgUsedData: { $avg: "$usedData" },
          maxQuota: { $max: "$totalQuota" },
          minQuota: { $min: "$totalQuota" },
          userCount: { $sum: 1 },
        },
      },
    ]);

    if (!stats.length) {
      return res.status(404).json({
        status: "fail",
        message: "No usage data found",
      });
    }

    // Remaining data total
    const totalRemaining = stats[0].totalQuota - stats[0].totalUsedData;

    return res.status(200).json({
      status: "success",
      data: {
        totalQuota: stats[0].totalQuota,
        totalUsedData: stats[0].totalUsedData,
        totalRemaining,
        avgQuota: stats[0].avgQuota,
        avgUsedData: stats[0].avgUsedData,
        maxQuota: stats[0].maxQuota,
        minQuota: stats[0].minQuota,
        userCount: stats[0].userCount,
      },
    });
  } catch (error) {
    console.error("Error fetching all users usage stats:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

//  getUsageTrends
exports.getUsageTrends = async (req, res) => {
  try {
    const { range = "daily" } = req.query;

    let groupId;
    let sortCondition;

    if (range === "daily") {
      groupId = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
        day: { $dayOfMonth: "$createdAt" },
      };
      sortCondition = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
    } else if (range === "weekly") {
      groupId = {
        year: { $year: "$createdAt" },
        week: { $isoWeek: "$createdAt" }, // use $isoWeek instead of $week
      };
      sortCondition = { "_id.year": 1, "_id.week": 1 };
    } else if (range === "monthly") {
      groupId = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      };
      sortCondition = { "_id.year": 1, "_id.month": 1 };
    }

    const trends = await Usage.aggregate([
      {
        $group: {
          _id: groupId,
          totalUsed: { $sum: "$usedData" },
        },
      },
      { $sort: sortCondition },
    ]);

    const formatted = trends.map((t) => {
      let dateLabel;
      if (range === "daily") {
        dateLabel = `${t._id.year}-${String(t._id.month).padStart(
          2,
          "0"
        )}-${String(t._id.day).padStart(2, "0")}`;
      } else if (range === "weekly") {
        dateLabel = `${t._id.year}-W${t._id.week}`;
      } else {
        dateLabel = `${t._id.year}-${String(t._id.month).padStart(2, "0")}`;
      }
      return {
        date: dateLabel,
        usedData: t.totalUsed,
      };
    });

    res.status(200).json({
      status: "success",
      range,
      data: formatted,
    });
  } catch (error) {
    console.error("Error fetching usage trends:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};
