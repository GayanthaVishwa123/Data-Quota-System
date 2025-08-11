const express = require("express");
const router = express.Router();
const Authcontroller = require("../controllers/authController");

router.route("/signup").post(Authcontroller.signup, Authcontroller.sendOtp);
router.route("/otpverified").post(Authcontroller.checkOtp);
router.route("/login").post(Authcontroller.login);

module.exports = router;
