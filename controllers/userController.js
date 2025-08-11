const redisClient = require("../config/redis");
const User = require("");
const { status } = require("express/lib/response");

//getUserProfile
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "User ID not found in request",
      });
    }

    const cacheKey = `user:${userId}`;

    // Check Redis
    const cachedUser = await redisClient.get(cacheKey);
    if (cachedUser) {
      const userObj = JSON.parse(cachedUser);
      return res.status(200).json({
        status: "success",
        message: "Profile retrieved from cache",
        data: userObj,
      });
    }

    // Fetch from Database
    const userDoc = await User.findById(userId).lean();
    if (!userDoc) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Remove sensitive fields
    delete userDoc.password;
    delete userDoc.confirmPassword;

    // Store in Redis (expire in 5 mins)
    await redisClient.setEx(cacheKey, 300, JSON.stringify(userDoc));

    res.status(200).json({
      status: "success",
      message: "Profile retrieved from database",
      data: userDoc,
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

//updateUserProfile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, password, email, phone } = req.body;

    // Disallow sensitive fields update
    if (password || email || phone) {
      return res.status(400).json({
        status: "fail",
        message:
          "You cannot update password, email, or phone from this endpoint",
      });
    }

    // Update profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name }, // Only allowed fields
      { new: true, runValidators: true }
    ).select("-password -confirmPassword");

    if (!updatedUser) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Update Redis cache
    const cacheKey = `user:${userId}`;
    await redisClient.setEx(cacheKey, 300, JSON.stringify(updatedUser));

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide current, new and confirm passwords",
      });
    }

    if (newPassword !== newPasswordConfirm) {
      return res.status(400).json({
        status: "fail",
        message: "New password and confirm password do not match",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    const isCorrect = await user.correctPassword(
      currentPassword,
      user.password
    );
    if (!isCorrect) {
      return res.status(401).json({
        status: "fail",
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    user.passwordConfirm = newPasswordConfirm;
    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      status: "success",
      token,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Password update error:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

// forget password
exports.forgetPassword = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email });
  if (!user) {
    return res.status(404).json({
      status: "fail",
      message: "No user found with that email address",
    });
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${req.protocol}://${req.get(
    "host"
  )}/chat-app/v1/auth/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit a PATCH request with your new password to: ${resetURL}\nIf you didn't request this, please ignore this email.`;
  try {
    await sendmailer({
      email: user.email,
      subject: "Your password reset token (valid for 10 mins)",
      message: message,
    });

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    if (user) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
    }

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email. Try again later!",
    });
  }
};

// reset password
exports.resetPassword = async (req, res) => {
  try {
    const token = req.params.token;
    const { newPassword, newPasswordConfirm } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Token is invalid or has expired",
      });
    }

    user.password = newPassword;
    user.passwordConfirm = newPasswordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    const newToken = generateToken(user._id);

    res.status(200).json({
      status: "success",
      message: "Password reset successful. You are now logged in.",
      token: newToken,
    });
  } catch (err) {
    console.error("Reset Error:", err);
    res.status(500).json({
      status: "error",
      message: "Something went wrong during password reset.",
    });
  }
};

exports.updatedEmailer = async (req, res) => {
  try {
    const { currentemail, newemail } = req.body;

    const user = await User.findOne({ email: currentemail });
    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Current email not found",
      });
    }

    user.email = newemail;
    user.isVerified = false;

    const token = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const confirmURL = `${req.protocol}://${req.get(
      "host"
    )}/chat-app/v1/auth/verify-email/${token}`;

    const message = `
Hi ${user.username},

You updated your email on Data Packege.  
Please verify your new email by clicking the link below:

👉 Verify Now: ${confirmURL}

This link will expire in 10 minutes.

If you didn’t request this, please ignore.

– Data Packege Team`;

    await sendmailer({
      email: newemail,
      subject: "Verify Your New Email Address",
      message,
    });

    res.status(200).json({
      status: "success",
      message: "Email updated. Verification sent to your new email.",
    });
  } catch (err) {
    console.error("Update Email Error:", err);
    res.status(500).json({
      status: "error",
      message: "Something went wrong while updating your email.",
    });
  }
};

//deleteUser / only for admin
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        status: "fail",
        message: "User ID is required",
      });
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Soft delete (mark delete_user flag true)
    user.delete_user = true;
    await user.save();

    res.status(200).json({
      status: "success",
      message: "User deleted (soft delete) successfully",
    });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};
//logoutUser
