import mongoose from "mongoose";

const parkingLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // parkingId: { type: Number, required: true },
    address: { type: String, required: true },
    ountryCode: { type: String, default: null },
    country: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    zip: { type: String, default: null },
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    time: { type: String, default: null },
    status: { type: Boolean, default: true },
    thumbs: [
      [
        {
          type: {
            type: String,
            default: null,
          },
          path: {
            type: String,
            default: null,
          },
        },
      ],
    ],
  },
  { timestamps: true },
);

parkingLocationSchema.index({ coordinates: "2dsphere" });

const ParkingLocation = mongoose.model(
  "ParkingLocation",
  parkingLocationSchema,
);

export default ParkingLocation;
