import mongoose from "mongoose";
import * as constants from "../constants/index.js";

const { Schema } = mongoose;

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2,
        message: "coordinates must be [lng, lat]",
      },
    },
  },
  { _id: false },
);

const extraLineItemSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: "Extra", required: true },
    unitPrice: { type: Number, required: true }, // snapshot at booking
    qty: { type: Number, default: 1, min: 1 },
    isRequired: { type: Boolean, default: false },
  },
  { _id: false },
);

const priceBreakdownSchema = new Schema(
  {
    base: { type: Number, default: 0 },
    extras: { type: Number, default: 0 },
    lateHourCharges: { type: Number, default: 0 },
    lastHourCharges: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 }, // base + extras + surcharges + tax - discount
    currency: { type: String, default: "USD" },
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    returnDriverId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", index: true },

    // Booking reference
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },

    // Locations (pickup & drop) - now optional
    pickup: {
      address: { type: String },
      location: { type: pointSchema }, // 2dsphere
    },
    dropoff: {
      address: { type: String },
      location: { type: pointSchema }, // 2dsphere
    },

    // Parking context
    parkingSpaceId: {
      type: Schema.Types.ObjectId,
      ref: "ParkingSpace",
      index: true,
      required: true,
    },

    // Flights (optional)
    departingFlight: { code: String, when: Date, note: String },
    returnFlight: { code: String, when: Date, note: String },

    // Vehicle
    vehicleId: { type: Schema.Types.ObjectId, ref: "Car" },
    vehicleSnapshot: {
      make: String,
      model: String,
      plateNumber: String,
      image: String,
    },

    // Timezone metadata
    scheduleTimezone: { type: String, default: "Asia/Kolkata" },

    // Extras (pricing snapshot)
    extraServices: [extraLineItemSchema],

    // Pricing
    pricing: priceBreakdownSchema,
    estimatedCost: { type: Number }, // optional legacy
    cost: { type: Number }, // optional legacy

    // Payment
    paymentMethod: { type: String, enum: ["cash", "card", "wallet"] },
    paymentStatus: {
      type: String,
      enum: ["pending", "authorized", "captured", "refunded", "failed"],
      default: "pending",
      index: true,
    },
    paymentSourceRefToken: { type: String },
    // paymentSourceRefNo: { type: Schema.Types.ObjectId, ref: "payment" },

    // Matching/dispatch
    nearByTempDrivers: { type: [Schema.Types.Mixed], default: [] },
    isDriverFound: { type: Boolean, default: false },
    driverFoundAt: { type: Date },
    returnDriverFoundAt: { type: Date },
    isReturnDriverFound: { type: Boolean, default: false },
    isTripAccepted: { type: Boolean, default: false },
    acceptedAt: { type: Date },

    // Status & lifecycle
    tripStatus: {
      type: String,
      enum: [
        constants.TRIP_FINDING,
        constants.TRIP_PENDING,
        constants.TRIP_ACCEPTED,
        constants.TRIP_PICKUP_INROUTE,
        constants.TRIP_ARRIVED,
        constants.TRIP_PARKING_INROUTE,
        constants.TRIP_PARKED,
        constants.TRIP_RETURN_INROUTE,
        constants.TRIP_RETURN_ARRIVED,
        constants.TRIP_COMPLETED,
        constants.TRIP_CANCELLED,
        constants.TRIP_NO_DRIVER_FOUND,
      ],
      default: constants.TRIP_FINDING,
      index: true,
    },
    tripConfirmedAt: { type: Date },
    driverArrivedAt: { type: Date },
    carParkedAt: { type: Date },
    pickedUpAt: { type: Date },
    droppedOffAt: { type: Date },
    returnArrivedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    promoCode: { type: Schema.Types.ObjectId, ref: "PromoCode" },

    // Security
    tripOTP: { type: Number, min: 1000, max: 9999 },
    tripOTPExpire: { type: String },
    parked: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    rejectedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    returnRejectedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    lastSearchAt: { type: Date },
    searchRound: { type: Number },

    // Auditing
    metadata: { type: Schema.Types.Mixed },
    additionalNotes: { type: String, default: null },
  },
  { timestamps: true },
);

// Geo indexes
tripSchema.index({ "pickup.location": "2dsphere" });
tripSchema.index({ "dropoff.location": "2dsphere" });

// Time/status compound indexes (now aligned with real fields)
tripSchema.index({ tripStatus: 1, "pickup.when": -1 });
tripSchema.index({ driverId: 1, "pickup.when": -1 });
tripSchema.index({ customerId: 1, "pickup.when": -1 });

const Trip = mongoose.models.Trip || mongoose.model("Trip", tripSchema);
export default Trip;
