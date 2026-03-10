import mongoose from "mongoose";

const extrasSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    isQuantityBased: {
      type: Boolean,
      default: false,
    },
    minQuantity: {
      type: Number,
      default: 0,
    },
    maxQuantity: {
      type: Number,
      default: 0,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Extra = mongoose.model("Extra", extrasSchema);

export default Extra;
