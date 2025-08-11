const Package = require("../models/packageModel");

exports.createPackage = async (req, res) => {
  try {
    const packageData = req.body;

    if (!packageData) {
      return res.status(400).json({
        status: "fail",
        message: "Package data is required",
      });
    }

    // Create package in DB
    const newPackage = await Package.create(packageData);

    res.status(201).json({
      status: "success",
      message: "Package created successfully",
      data: newPackage,
    });
  } catch (error) {
    console.error("Create package error:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

//getAllPackages
exports.getAllPackage = async (req, res) => {
  try {
    const packages = await Package.find().lean();
    res.status(200).json({
      status: "success",
      results: packages.length,
      data: packages,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
};
//getOnePackege
exports.getPackageById = async (req, res) => {
  try {
    const packageId = req.params.id;

    if (!packageId) {
      return res.status(400).json({
        status: "fail",
        message: "Package ID is required",
      });
    }

    const packageData = await Package.findById(packageId).lean();

    if (!packageData) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: packageData,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
};

//active packege
exports.activePackege = async (req, res) => {
  try {
    const packageId = req.params.id;
    if (!packageId) {
      return res.status(400).json({
        status: "fail",
        message: "Package ID is required",
      });
    }

    const activepackege = await Package.findById(packageId);
    if (!activepackege) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    activepackege.status = "active";
    await activepackege.save();

    return res.status(200).json({
      status: "success",
      message: "Package activated successfully",
      data: activepackege,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// updatePackage
exports.updatePackage = async (req, res) => {
  try {
    const packageId = req.params.id;
    const packageUpdate = req.body;

    if (!packageId) {
      return res.status(400).json({
        status: "fail",
        message: "Package ID is required",
      });
    }

    if (!packageUpdate || Object.keys(packageUpdate).length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "Update data is required",
      });
    }

    const updatedPackage = await Package.findOneAndUpdate(
      { _id: packageId },
      packageUpdate,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedPackage) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: updatedPackage,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
};

//deletePackage
exports.deletePackage = async (req, res) => {
  try {
    const packageId = req.params.id;

    if (!packageId) {
      return res.status(400).json({
        status: "fail",
        message: "Package ID is required",
      });
    }

    const deletedPackage = await Package.findByIdAndDelete(packageId).lean();

    if (!deletedPackage) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Package deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
};
//calculatePackageSpeed
///
