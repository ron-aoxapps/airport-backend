// models/Review.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    tripId: {
      type: Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    author: {
      type: String,
      enum: ["customer", "driver"],
      required: true,
      index: true,
    },

    rating: { type: Number, min: 0, max: 5, required: true },
    feedback: { type: String, trim: true, maxlength: 5000 },
    reviewStage: {
      type: String,
      enum: ["pickup", "dropoff"],
      default: "pickup",
      index: true,
    },
  },
  { timestamps: true },
);

reviewSchema.index({ tripId: 1, author: 1, reviewStage: 1 }, { unique: true });

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
export default Review;
