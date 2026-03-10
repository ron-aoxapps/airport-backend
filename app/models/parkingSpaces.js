import mongoose from "mongoose";

const assignedExtraSchema = new mongoose.Schema(
  {
    extra: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Extra",
      required: true,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const parkingSpaceSchema = new mongoose.Schema(
  {
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingLocation",
      required: true,
    },
    name: { type: String, required: true },
    description: { type: String },
    defaultCount: { type: Number, default: 0 },
    defaultPrice: { type: Number, default: 0 },
    status: { type: Boolean, default: false },
    seasonalRates: { type: mongoose.Schema.Types.Mixed, default: [] },
    assignedExtras: [assignedExtraSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

if (mongoose.connection.models.ParkingSpace) {
  delete mongoose.connection.models.ParkingSpace;
  delete mongoose.models.ParkingSpace;
}
export default mongoose.model("ParkingSpace", parkingSpaceSchema);
