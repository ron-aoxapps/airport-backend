import mongoose from "mongoose";
import * as constants from "../constants/index.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
    },
    address: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
    },
    countryCode: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isNumberVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "driver"],
      default: "user",
    },
    verificationCode: {
      type: String,
      default: null,
    },
    verificationCodeExpires: {
      type: Date,
      default: null,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    stripeAccountId: {
      type: String,
      default: null,
    },
    isAccountConnected: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    driverStatus: {
      type: String,
      enum: [
        constants.DRIVER_FINDING_TRIPS,
        constants.DRIVER_OFFLINE,
        constants.DRIVER_ONLINE,
        constants.DRIVER_ON_PICKUP,
        constants.DRIVER_DESTINATION_INROUTE,
      ],
      default: "Offline",
    },
    drivingLicense: {
      type: String,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    token: {
      type: String,
    },
    country: {
      type: String,
    },
    firebaseToken: {
      type: String,
    },
    lastOnlineAt: {
      type: Date,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (v) {
            return !v || (Array.isArray(v) && v.length === 2);
          },
          message: "Coordinates must be an array of [longitude, latitude]",
        },
      },
    },
    // Password reset fields
    passwordResetCode: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    currentTripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetTokenExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ location: "2dsphere" });

const User = mongoose.model("User", userSchema);

export default User;
