const { default: exports } = require("three/examples/jsm/libs/tween.module.js");
const jwtToken = require("jsonwebtoken");
const User = require("../models/userModel");
const redisClient = require("../config/redis");
const otpStore = new Map();
const { pass } = require("three/tsl");
const { status } = require("express/lib/response");

const generateToken = (id) => {
  return jwtToken.sign({ id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

exports.signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone } = req.body;

    //Required fields check
    if (!name || !email || !password || !confirmPassword || !phone) {
      return res.status(400).json({
        status: "fail",
        message: "All fields are required",
      });
    }

    // Password match check
    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "fail",
        message: "Passwords do not match",
      });
    }

    // Create user in MongoDB
    const user = await User.create({ name, email, password, phone });

    // Generate JWT token
    const token = generateToken(user._id);

    // Prepare Redis cache key and value
    const cacheKey = `user:${user._id}`;

    // Convert user document to plain object and remove sensitive data
    const userData = user.toObject();
    delete userData.password;
    delete userData.confirmPassword;

    // Save to Redis with 5 minutes expiry
    await redisClient.set(cacheKey, JSON.stringify(userData), "EX", 300);

    //Send response without password
    res.status(201).json({
      status: "success",
      message: "User registered successfully",
      token,
      data: { user: userData },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Email or phone and password are required",
      });
    }

    // Prepare Redis key(s)
    const cacheKeyByEmail = email ? `user:email:${email}` : null;
    const cacheKeyByPhone = phone ? `user:phone:${phone}` : null;

    let cachedUserData = null;

    if (cacheKeyByEmail) {
      const cached = await redisClient.get(cacheKeyByEmail);
      if (cached) cachedUserData = JSON.parse(cached);
    }

    if (!cachedUserData && cacheKeyByPhone) {
      const cached = await redisClient.get(cacheKeyByPhone);
      if (cached) cachedUserData = JSON.parse(cached);
    }

    let user;

    if (cachedUserData) {
      // User data found in Redis cache
      user = cachedUserData;
      // Redis won't have password hash, so still need to query DB for password verification
      const dbUser = await User.findOne({
        $or: [{ email: email }, { phone: phone }],
      }).select("+password");

      if (!dbUser) {
        return res
          .status(401)
          .json({ status: "fail", message: "User not found" });
      }

      // Check if email and phone are verified
      if (!user.isVerified || !user.isPhoneVerified) {
        return res.status(403).json({
          status: "fail",
          message: "Please verify your email and phone number",
        });
      }
      const isMatch = await User.correctPassword(password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ status: "fail", message: "Incorrect password" });
      }

      user = dbUser;
    } else {
      // Cache miss → query DB
      user = await User.findOne({
        $or: [{ email: email || null }, { phone: phone || null }],
      }).select("+password");

      if (!user) {
        return res
          .status(401)
          .json({ status: "fail", message: "User not found" });
      }

      const isMatch = await User.confirmPassword(password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ status: "fail", message: "Incorrect password" });
      }

      // Cache user data in Redis for next time (without password)
      const userToCache = user.toObject();
      delete userToCache.password;
      const userCacheKey = user.email
        ? `user:email:${user.email}`
        : `user:phone:${user.phone}`;
      await redisClient.set(
        userCacheKey,
        JSON.stringify(userToCache),
        "EX",
        300
      );
    }

    // Generate JWT token
    const token = generateToken(user._id);

    const userSafe = user.toObject ? user.toObject() : user;
    if (userSafe.password) delete userSafe.password;

    return res.status(200).json({
      status: "success",
      message: "Logged in successfully",
      token,
      data: { user: userSafe },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

//jwt verify/session id
exports.protectRoute = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    console.log("Authorization Header:", req.headers.authorization);
    console.log("Token:", `"${token}"`);

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in! Please login to get access.",
      });
    }

    const decoded = await promisify(jwt.verify)(
      token,
      process.env.JWT_SECRET_KEY
    );

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        status: "fail",
        message: "User no longer exists.",
      });
    }

    if (
      currentUser.changedPasswordAfter &&
      currentUser.changedPasswordAfter(decoded.iat)
    ) {
      return res.status(401).json({
        message: "Password recently changed. Please log in again.",
      });
    }

    req.user = currentUser;
    next();
  } catch (err) {
    return res.status(401).json({
      status: "fail",
      message: "Invalid token or session expired, please login again.",
    });
  }
};
//Assign role
exports.checkAdmin = (req, res, next) => {
  try {
    const { role } = req.user;

    if (role !== "admin") {
      return res.status(403).json({
        status: "fail",
        message: "Access denied. Admins only.",
      });
    }

    next();
  } catch (err) {
    console.error("Role check error:", err);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};
///verifyEmail

//sent otp
exports.sendOtp = (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        status: "fail",
        message: "Phone number is required",
      });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP with expiry (e.g., 5 mins) in memory
    redisClient.set(phone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // TODO: Send OTP via SMS Gateway API
    console.log(`Sending OTP ${otp} to phone number ${phone}`);

    res.status(200).json({
      status: "success",
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

// Check OTP code
exports.checkOtp = async (req, res, next) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        status: "fail",
        message: "Phone number and OTP are required",
      });
    }

    // Get OTP from Redis
    const otpcacheKey = `otp:${phoneNumber}`;
    const storedOtp = await redisClient.get(otpcacheKey);

    if (!storedOtp) {
      return res.status(400).json({
        status: "fail",
        message: "OTP expired or not found",
      });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid OTP",
      });
    }

    // Find the user by phone number
    const user = await User.findOne({ phone: phoneNumber });

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Update isPhoneVerified to true
    user.isPhoneVerified = true;
    await user.save();

    // OTP is correct → delete from Redis
    await redisClient.del(`otp:${phoneNumber}`);

    res.status(200).json({
      status: "success",
      message: "OTP verified successfully",
    });
    next();
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
};
