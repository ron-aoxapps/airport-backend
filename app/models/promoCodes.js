import mongoose from "mongoose";

const { Schema } = mongoose;

const promoCodeSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ["Flat", "Percent"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    maxAmount: {
      type: Number,
      default: null,
    },
    name: {
      type: String,
      trim: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
    level: {
      type: String,
      enum: ["city", "state", "country", "global", "list"],
      default: "global",
    },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    visible: { type: Boolean, default: true },
    limit: { type: Number, default: null },
    used: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

promoCodeSchema.index({ code: 1 });
promoCodeSchema.index({ validUntil: 1 });
promoCodeSchema.index({ level: 1 });

const PromoCode =
  mongoose.models.PromoCode || mongoose.model("PromoCode", promoCodeSchema);

export default PromoCode;
