const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    totalQuota: {
      type: Number, // MB / GB
      required: true,
    },
    usedData: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "expired", "exhausted"],
      default: "active",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Virtual property to get remaining data
usageSchema.virtual("remainingData").get(function () {
  return this.totalQuota - this.usedData;
});

// Virtual property to get used data percentage
usageSchema.virtual("percentUse").get(function () {
  const usedData = this.usedData;
  const totalQuota = this.totalQuota;
  const percent = (usedData / totalQuota) * 100;
  return percent;
});

usageSchema.methods.currentDatatracking = function (currentDataUsing) {
  this.usedData = currentDataUsing + this.usedData;
  return this.usedData;
};

const Usage = mongoose.model("Usage", usageSchema);
module.exports = Usage;
