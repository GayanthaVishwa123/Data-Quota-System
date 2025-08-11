const Users = require("../controllers/userController");
const redisClient = require("../config/redis");
const Package = require("../models/packageModel");
const { status } = require("express/lib/response");
const { default: exports } = require("three/examples/jsm/libs/tween.module.js");

// System has all of  users .
exports.getAllUsers = async (req, res) => {
  try {
    const cacheKey = "user:users";

    //  Check Redis cache
    const cachedUsers = await redisClient.sMembers(cacheKey);
    if (cachedUsers && cachedUsers.length > 0) {
      console.log("From Redis Cache");
      return res.status(200).json({
        status: "success",
        message: "Your system has users (from Redis)",
        data: cachedUsers.map((user) => JSON.parse(user)),
      });
    }

    //  If not in Redis → Get from Database
    const allUsers = await Users.find();

    //  Store in Redis Set
    for (const user of allUsers) {
      await redisClient.sAdd(cacheKey, JSON.stringify(user));
    }

    res.status(200).json({
      status: "success",
      message: "Your system has users (from DB)",
      data: allUsers,
    });
  } catch (error) {
    console.error(" Error fetching users:", error);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// manually reset data quta
exports.resetAllUsersQuota = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    const cacheKey = `usage:${userId}`;
    const usageData = await redisClient.get(cacheKey);

    if (!usageData) {
      return res.status(404).json({
        status: "fail",
        message: "No usage data found for this user",
      });
    }

    const userUsage = JSON.parse(usageData);
    userUsage.usedData = 0; // Reset daily usage

    await redisClient.set(cacheKey, JSON.stringify(userUsage));

    return res.status(200).json({
      status: "success",
      message: "Daily usage reset for user successfully",
      data: userUsage,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Server error while resetting daily usage",
    });
  }
};

//  blockUser(userId)
exports.blockUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "User ID not provided",
      });
    }

    // updateone => Mongoose method name: updateOne (capital O)
    // is_blocked field (not is_block)
    const blockUser = await Users.updateOne(
      { _id: userId },
      { $set: { is_blocked: true } }
    );

    if (blockUser.matchedCount === 0) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    if (blockUser.modifiedCount === 0) {
      return res.status(200).json({
        status: "success",
        message: "User already blocked",
      });
    }

    res.status(200).json({
      status: "success",
      message: "User blocked successfully",
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "User ID not provided",
      });
    }

    // updateOne is async, so await it
    const unblockUser = await Users.updateOne(
      { _id: userId },
      { $set: { is_blocked: false } }
    );

    if (unblockUser.matchedCount === 0) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    if (unblockUser.modifiedCount === 0) {
      return res.status(200).json({
        status: "success",
        message: "User already unblocked",
      });
    }

    res.status(200).json({
      status: "success",
      message: "User unblocked successfully",
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

// Mannual active
exports.assignPackageToUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const packageId = req.params.id;

    if (!userId || !packageId) {
      return res.status(400).json({
        status: "fail",
        message: "User ID and Package ID are required",
      });
    }

    // Check if user exists
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Check if package exists
    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    // user has 'currentPackage' field referencing package
    user.currentPackage = pkg._id;
    await user.save();

    res.status(200).json({
      status: "success",
      message: "Package assigned to user successfully",
      data: {
        userId: user._id,
        packageId: pkg._id,
      },
    });
  } catch (error) {
    console.error("Error assigning package to user:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};
