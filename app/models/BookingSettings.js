import mongoose from "mongoose";

const seasonalSettingSchema = new mongoose.Schema(
  {
    validFrom: { type: Date },
    validTo: { type: Date },
    minimumLength: { type: Number, default: 1 },
    maximumLength: { type: Number, default: 2 },
  },
  { _id: false }
);

const reservationTimeOptionsSchema = new mongoose.Schema(
  {
    minimumBookingDaysLength: { type: Number, default: 1 },
    useMaxBooking: { type: Boolean, default: false },
    maxBookingDaysLength: { type: Number, default: 0 },
    onHoldHoursWhilePending: { type: Number, default: 1 },
    blockedHoursAfterDeparture: { type: Number, default: 1 },
    advanceBookingDaysLimit: { type: Number, default: 30 },
    bookInAdvanceHours: { type: Number, default: 1 },
    seasonalSettings: [seasonalSettingSchema],
  },
  { _id: false }
);

const reservationOptionSchema = new mongoose.Schema(
  {
    newReservationStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled"],
      default: "Pending",
    },
    depositPaidStatus: {
      type: String,
      enum: ["Pending", "Confirmed"],
      default: "Confirmed",
    },
    cancelHours: { type: Number, default: 4 },
    changeHours: { type: Number, default: 1 },
  },
  { _id: false }
);

const bookingSettingsSchema = new mongoose.Schema(
  {
    pricing: {
      type: String,
      enum: ["per_day", "per_night", "per_24h"],
      default: "per_day",
    },

    depositOption: {
      type: String,
      enum: ["full", "fixed", "per_24h", "none"],
      default: "per_day",
    },

    reservationOption: reservationOptionSchema,

    reservationTimeOptions: reservationTimeOptionsSchema,

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const BookingSettings = mongoose.model(
  "BookingSettings",
  bookingSettingsSchema
);

export default BookingSettings;
