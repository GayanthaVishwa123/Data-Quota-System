const express = require("express");
const router = express.Router();

const AuthController = require("../controllers/authController");
const datausageController = require("../controllers/datausageController");

router
  .route("/")
  .get(AuthController.protectRoute, datausageController.getUsageStatus);
router
  .route("/usageupdate")
  .patch(AuthController.protectRoute, datausageController.updateUsage);
router
  .route("/getquota")
  .get(AuthController.protectRoute, datausageController.checkQuota);
router
  .route("/expire")
  .post(AuthController.protectRoute, datausageController.expireOldPackages);

router
  .route("/notify")
  .get(AuthController.protectRoute, datausageController.notifyUsage);
router
  .route("/reset-daily")
  .post(
    AuthController.protectRoute,
    AuthController.checkAdmin,
    datausageController.resetDailyUsage
  );

module.exports = router;
