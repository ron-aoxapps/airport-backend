import mongoose from "mongoose";

const PricingSchema = new mongoose.Schema(
  {
    rental_price: { type: Number, default: 0 },
    extra_price: { type: Number, default: 0 },
    out_of_hours_price: { type: Number, default: 0 },
    sub_total: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    vat: { type: Number, default: null },
    vat_price: { type: Number, default: null },
    total: { type: Number, default: 0 },
    default_total: { type: Number, default: null },
    change_total: { type: Number, default: null },
    deposit: { type: Number, default: 0 },

    // before-discount breakdowns
    parking_before_discount: { type: Number, default: 0 },
    extra_before_discount: { type: Number, default: 0 },
    sub_total_before_discount: { type: Number, default: 0 },

    // discounts
    account_discount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discount_code: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const CurrencySchema = new mongoose.Schema(
  {
    sign: { type: String, trim: true }, // e.g., "$"
    value: { type: String, trim: true }, // e.g., "USD"
  },
  { _id: false },
);

const VehicleSchema = new mongoose.Schema(
  {
    regno: { type: String, default: null, trim: true }, // c_regno
    make: { type: String, default: null, trim: true }, // c_make
    model: { type: String, default: null, trim: true }, // c_model
  },
  { _id: false },
);

const CustomerSchema = new mongoose.Schema(
  {
    title: { type: String, default: null, trim: true }, // c_title
    name: { type: String, default: null, trim: true }, // c_name
    phone: { type: String, default: null, trim: true }, // c_phone
    email: { type: String, default: null, trim: true }, // c_email
    company: { type: String, default: null, trim: true }, // c_company
    notes: { type: String, default: null, trim: true }, // c_notes

    address: { type: String, default: null, trim: true }, // c_address
    city: { type: String, default: null, trim: true }, // c_city
    state: { type: String, default: null, trim: true }, // c_state
    zip: { type: String, default: null, trim: true }, // c_zip
    country: { type: String, default: null, trim: true }, // c_country

    pax: { type: String, default: null, trim: true }, // c_pax
  },
  { _id: false },
);

const BillingSchema = new mongoose.Schema(
  {
    vat: { type: String, default: null, trim: true }, // b_vat
    email: { type: String, default: null, trim: true }, // b_email
    phone: { type: String, default: null, trim: true }, // b_phone
    country: { type: String, default: null, trim: true }, // b_country
    state: { type: String, default: null, trim: true }, // b_state
    city: { type: String, default: null, trim: true }, // b_city
    address: { type: String, default: null, trim: true }, // b_address
    zip: { type: String, default: null, trim: true }, // b_zip
  },
  { _id: false },
);

const BookingSchema = new mongoose.Schema(
  {
    // Internal references
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },
    parkingSpaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSpace",
      default: null,
    },
    externalBookingId: { type: String, required: true },

    // Status & gateway
    status: {
      type: String,
      enum: [
        "requested",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "confirmed",
      ],
      default: "requested",
      index: true,
    },

    payment_method: { type: String, default: null, trim: true }, // "braintree"

    txn_amount: { type: Number, default: null },
    txn_id: { type: String, default: null, trim: true, index: true },

    // Timing
    from: { type: Date, required: true, index: true }, // start
    to: { type: Date, required: true, index: true }, // end
    processed_on: { type: Date, default: null },

    // Raw created/modified from source (kept separate from Mongoose timestamps)
    source_created_at: { type: Date, default: null },
    source_modified_at: { type: Date, default: null },

    location: { type: String, default: null },
    space_name: { type: String, default: null },

    // Grouped subdocs
    pricing: { type: PricingSchema, default: {} },
    currency: { type: CurrencySchema, default: {} },
    vehicle: { type: VehicleSchema, default: {} },
    customer: { type: CustomerSchema, default: {} },
    rawSourceData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

BookingSchema.index({ "customer.email": 1 }, { sparse: true });
BookingSchema.index({ "customer.phone": 1 }, { sparse: true });
BookingSchema.index({ status: 1, from: 1 });
BookingSchema.index({ txn_id: 1 }, { unique: false });

const Booking = mongoose.model("Booking", BookingSchema);
export default Booking;
