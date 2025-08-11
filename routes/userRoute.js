const express = require("express");
const router = express.Router();

const AuthController = require("../controllers/authController");
const UserController = require("../controllers/userController");

router
  .route("/")
  .get(AuthController.protectRoute, UserController.getUserProfile);
router
  .route("/updateProfile")
  .patch(AuthController.protectRoute, UserController.updateProfile);
router.route("/forgetpassword").post(UserController.forgetPassword);
router.route("/resetpassword").post(UserController.resetPassword);
router
  .route("/users/:id")
  .delete(AuthController.checkAdmin, UserController.deleteUser);

module.exports = router;
