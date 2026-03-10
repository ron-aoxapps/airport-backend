import mongoose from "mongoose";

const carSchema = new mongoose.Schema(
  {
    carMake: { type: String, required: true },
    carColor: { type: String, required: true },
    carImage: { type: String },
    plateNumber: { type: String, required: true, unique: true },
    carModel: { type: String, required: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Car = mongoose.model("Car", carSchema);
export default Car;
