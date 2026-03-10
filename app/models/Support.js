import mongoose from "mongoose";

const supportSchema = new mongoose.Schema(
  {
    msg: { type: String, required: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "resolved", "ongoing"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const Support = mongoose.model("Support", supportSchema);
export default Support;
