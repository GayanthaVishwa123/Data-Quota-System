const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Package name is required"],
      unique: true,
    },
    quota: {
      type: Number,
      required: [true, "Data quota is required"], // e.g., 1024 MB
    },
    price: {
      type: Number,
      required: [true, "Package price is required"],
    },
    validity: {
      type: Number,
      required: [true, "Validity period (in days) is required"],
    },
    type: {
      type: String,
      enum: ["general", "app-specific", "night-time", "social", "video"],
      default: "general",
    },
    speedLimit: {
      type: Number, // Mbps
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },
  },
  { timestamps: true }
);

const Package = mongoose.model("Package", packageSchema);
module.exports = Package;
