const { status } = require("init");
const redisClient = require("../config/redis");
const UsageData = require("../models/usageLogModel");
const UserData = require("../models/userModel");
const Reset = require("../utils/reset");
const { json } = require("express");
const Usage = require("../models/usageLogModel");

// pipline command using redis
exports.getUsageStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    const cacheKey = `usage:${userId}`;

    //  Check Redis cache
    const cachedUsage = await redisClient.get(cacheKey);
    if (cachedUsage) {
      const usage = JSON.parse(cachedUsage);
      return res.status(200).json({
        status: "success (from cache)",
        data: { usage },
      });
    }

    //  Get from MongoDB if not in Redis
    const usage = await UsageData.findOne({ userId, status: "active" });

    if (!usage) {
      return res.status(404).json({
        status: "fail",
        message: "No active usage found",
      });
    }
    // Serialize with virtuals
    const usageJSON = usage.toJSON();

    //  Cache the result in Redis for next time (1 hour)
    await redisClient.set(cacheKey, JSON.stringify(usageJSON), {
      EX: 3600,
    });

    //  Return usage data
    return res.status(200).json({
      status: "success (from DB)",
      data: { usage },
    });
  } catch (err) {
    console.error("Error getting usage status:", err);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

exports.updateUsage = async (req, res) => {
  const userId = req.user.id;
  const { consumedData } = req.body;

  if (!userId || !consumedData) {
    return res.status(400).json({
      status: "fail",
      message: "Missing user or data amount",
    });
  }

  const cacheKey = `usage:${userId}`;

  try {
    //  Try Redis cache first
    let cachedUsage = await redisClient.get(cacheKey);

    if (cachedUsage) {
      cachedUsage = JSON.parse(cachedUsage);
      cachedUsage.usedData += consumedData;

      // Update Redis
      await redisClient.set(cacheKey, JSON.stringify(cachedUsage));

      // Update MongoDB (real-time)
      await Usage.updateOne(
        { user: userId },
        { $inc: { usedData: consumedData } }
      );

      return res.status(200).json({
        status: "success",
        message: "Usage updated (Redis + DB)",
        data: cachedUsage,
      });
    }

    // Fallback to MongoDB
    const usageDoc = await Usage.findOne({ userId });

    if (!usageDoc) {
      return res.status(404).json({
        status: "fail",
        message: "Usage data not found",
      });
    }

    // Use the method to track
    usageDoc.currentDatatracking(consumedData);
    await usageDoc.save();

    // Save new usage to cache
    await redisClient.set(cacheKey, JSON.stringify(usageDoc.toObject()));

    return res.status(200).json({
      status: "success",
      message: "Usage updated (DB + Redis set)",
      data: {
        usedData: usageDoc.usedData,
        remaining: usageDoc.remainingData,
      },
    });
  } catch (err) {
    console.error("Update usage error:", err);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

exports.checkQuota = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    // Check Redis Cache
    const cacheKey = `usage:${userId}`;
    const usage = await redisClient.get(cacheKey);

    if (usage) {
      const usageObj = JSON.parse(usage);

      if (usageObj.remainingData <= 0) {
        return res.status(403).json({
          status: "fail",
          message: "Data quota exhausted (from Redis)",
        });
      }

      return res.status(200).json({
        status: "success",
        message: "Quota available (from Redis)",
        data: usageObj,
      });
    }

    //  Redis not found, check DB
    const userDoc = await Usage.findOne({ userId: userId, status: "active" });

    if (!userDoc) {
      return res.status(404).json({
        status: "fail",
        message: "No active usage found (from DB)",
      });
    }

    if (userDoc.remainingData <= 0) {
      return res.status(403).json({
        status: "fail",
        message: "Data quota exhausted (from DB)",
      });
    }

    // Save to Redis for next time
    const usageData = {
      totalQuota: userDoc.totalQuota,
      usedData: userDoc.usedData,
      remainingData: userDoc.remainingData,
    };

    await redisClient.set(cacheKey, JSON.stringify(usageData), {
      EX: 60 * 5,
    });

    return res.status(200).json({
      status: "success",
      message: "Quota available (from DB)",
      data: usageData,
    });
  } catch (error) {
    console.error("Error in checkQuota:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
};

exports.expireOldPackages = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(404).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    // Check Redis
    const cacheKey = `usage:${userId}`;
    const usage = await redisClient.get(cacheKey);

    if (usage) {
      const useObj = JSON.parse(usage);

      const currentDate = new Date();
      const endDate = new Date(useObj.endDate);

      if (currentDate > endDate) {
        // Expired: update DB + remove from Redis
        await Usage.updateOne(
          { userId: userId, status: "active" },
          { $set: { status: "expired" } }
        );

        await redisClient.del(cacheKey);

        return res.status(200).json({
          status: "success",
          message: "Package expired successfully",
        });
      } else {
        return res.status(200).json({
          status: "success",
          message: "Package still valid",
        });
      }
    } else {
      return res.status(404).json({
        status: "fail",
        message: "No active usage found in Redis",
      });
    }
  } catch (err) {
    console.error("expireOldPackages error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
};

exports.notifyUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    const cacheKey = `usage:${userId}`;
    let usageData = await redisClient.get(cacheKey);

    // Redis cache miss  to check DB
    if (!usageData) {
      const userDoc = await UsageData.findOne({ userId, status: "active" });
      if (!userDoc) {
        return res.status(404).json({
          status: "fail",
          message: "No active usage found",
        });
      }

      usageData = JSON.stringify({
        usedData: userDoc.usedData,
        totalQuota: userDoc.totalQuota,
      });

      // Cache update
      await redisClient.set(cacheKey, usageData, { EX: 3600 });
    }

    const userUsage = JSON.parse(usageData);
    const usedData = userUsage.usedData;
    const totalQuota = userUsage.totalQuota;
    const percent = (usedData / totalQuota) * 100;

    let message = null;

    if (percent >= 100) {
      message = "Your package is fully used up.";
    } else if (percent >= 80) {
      message = "Warning: You’ve used 80% of your package.";
    } else if (percent >= 50) {
      message = "You’ve used 50% of your package.";
    }

    if (message) {
      // User phone number get DB
      const userDetails = await User.findById(userId).select("phone");
      if (userDetails.phone) {
        await sendSMS(userDetails.phone, message);
      }
    }

    return res.status(200).json({
      status: "success",
      message: message || "Usage is within safe limits",
      data: {
        usedData,
        totalQuota,
        percentUsed: percent.toFixed(2) + "%",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Server error while checking usage",
    });
  }
};
// auto  reset
const RESET_FLAG_KEY = "dailyReset:lastReset";

exports.resetDailyUsage = async () => {
  try {
    // Check last reset time from Redis
    const lastResetStr = await redisClient.get(RESET_FLAG_KEY);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (lastResetStr) {
      const lastReset = parseInt(lastResetStr, 10);
      // If last reset was less than 24 hours ago, skip reset
      if (now - lastReset < ONE_DAY) {
        console.log(
          "Daily usage reset already done within last 24 hours, skipping."
        );
        return;
      }
    }

    // Get all usage keys
    const keys = await redisClient.keys("usage:");

    for (const key of keys) {
      const usageData = await redisClient.get(key);
      if (usageData) {
        const userUsage = JSON.parse(usageData);
        userUsage.usedData = 0;
        await redisClient.set(key, JSON.stringify(userUsage));
      }
    }

    // Save reset timestamp
    await redisClient.set(RESET_FLAG_KEY, now.toString());

    console.log("Daily usage reset completed successfully for all users.");
  } catch (err) {
    console.error("Error during daily usage reset:", err);
  }
};

// 7.getAllUserUsages()   	All users ge usage data ganna (admin panel ekata)///
