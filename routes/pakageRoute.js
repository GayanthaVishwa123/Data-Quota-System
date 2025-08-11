const express = require("express");
const router = express.Router();

const packageController = require("../controllers/packageController");
const AuthControleer = require("../controllers/authController");

router
  .route("/")
  .post(
    AuthControleer.protectRoute,
    AuthControleer.checkAdmin,
    packageController.createPackage
  );

router
  .route("/allpackage")
  .get(AuthControleer.protectRoute, packageController.getAllPackage);

router
  .route("/getpackage/:id")
  .get(AuthControleer.protectRoute, packageController.getPackageById);
router
  .route("/activepackage/:id")
  .get(AuthControleer.protectRoute, packageController.activePackege);
router
  .route("/updatepackage/:id")
  .patch(
    AuthControleer.protectRoute,
    AuthControleer.checkAdmin,
    packageController.updatePackage
  );
router
  .route("/deletepackage/:id")
  .delete(
    AuthControleer.protectRoute,
    AuthControleer.checkAdmin,
    packageController.updatePackage
  );
