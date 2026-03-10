import dotenv from "dotenv";
import axios from "axios";
import Booking from "../models/Booking.js";
import { GET_BOOKINGS } from "../constants/parkingSoftwareApis.js";
import User from "../models/User.js";
import Trip from "../models/Trips.js";
import ParkingSpace from "../models/parkingSpaces.js";
import * as constants from "../constants/index.js";
import { notifyNearbyDrivers } from "./notifyDrivers.js";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import { sendAccountLink } from "./emailtemplate.js";

dotenv.config();

function normalizePhone(rawPhone) {
  if (!rawPhone) return null;

  // Remove everything except digits
  const digits = rawPhone.replace(/\D/g, "");

  // Must be at least 10 digits
  if (digits.length < 10) return null;

  // Last 10 digits = phone number
  const phoneNumber = digits.slice(-10);

  // Remaining starting digits (if any) = country code
  const countryDigits = digits.slice(0, -10);

  const countryCode = countryDigits.length > 0 ? `+${countryDigits}` : "+1";

  return {
    countryCode,
    phoneNumber,
  };
}

async function ensureCustomerFromBooking(bookingDoc) {
  const email = bookingDoc.customer?.email?.toLowerCase();
  if (!email) return null;

  let user = await User.findOne({ email });

  // If user already exists → return without resending onboarding
  if (user) return user;

  const normalizedPhone = normalizePhone(bookingDoc.customer?.phone);

  user = await User.create({
    name: bookingDoc.customer?.name || "Guest",
    email,
    phoneNumber: normalizedPhone?.phoneNumber || null,
    countryCode: normalizedPhone?.countryCode || null,
    role: "user",
    isVerified: true,
    isNumberVerified: !!normalizedPhone,
  });

  // -----------------------------
  // Generate secure password setup token
  // -----------------------------
  const rawToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetTokenExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  await user.save();

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  const subject = "Welcome to Airport Valley - Activate Your Account";

  try {
    const html = sendAccountLink(resetLink);
    await sendEmail({
      to: user.email,
      subject,
      html,
    });
  } catch (error) {
    console.error("Onboarding email failed:", error);
  }

  return user;
}

async function createTripFromBooking(bookingDoc, user) {
  if (bookingDoc.status !== "confirmed") return null;

  if (bookingDoc.tripId) return null;

  const parkingSpace = await ParkingSpace.findOne({
    name: bookingDoc.space_name,
  }).populate("locationId", "coordinates");

  if (!parkingSpace) return null;

  const newTrip = await Trip.create({
    customerId: user._id,
    bookingId: bookingDoc._id,
    parkingSpaceId: parkingSpace._id,
    tripStatus: constants.TRIP_FINDING,
    tripConfirmedAt: new Date(),
    pickup: bookingDoc.pickup,
    dropoff: bookingDoc.dropoff,
  });

  await Booking.findByIdAndUpdate(bookingDoc._id, {
    tripId: newTrip._id,
  });

  const nearByDrivers = await User.find({
    role: "driver",
    driverStatus: constants.DRIVER_FINDING_TRIPS,
    isVerified: true,
  }).select("_id firebaseToken driverStatus");

  await Trip.findByIdAndUpdate(newTrip._id, {
    nearByTempDrivers: nearByDrivers.map((d) => d._id),
    isDriverFound: nearByDrivers.length ? "yes" : "no",
  });

  if (nearByDrivers.length) {
    await notifyNearbyDrivers({
      drivers: nearByDrivers,
      trip: newTrip,
      customerName: user.name,
    });
  }

  return newTrip;
}

const toNum = (v) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const toDate = (v) => (v ? new Date(String(v).replace(" ", "T") + "Z") : null);

function mapExternalBooking(payload) {
  return {
    externalBookingId: payload.uuid,

    status: payload.status || "confirmed",
    payment_method: payload.payment_method || payload.payment_gateway || null,

    txn_amount: toNum(payload.txn_amount),
    txn_id: payload.txn_id || null,

    from: toDate(payload.from),
    to: toDate(payload.to),
    processed_on: toDate(payload.processed_on),

    source_created_at: toDate(payload.created),
    source_modified_at: toDate(payload.modified),

    pricing: {
      rental_price: toNum(payload.rental_price) ?? 0,
      extra_price: toNum(payload.extra_price) ?? 0,
      out_of_hours_price: toNum(payload.out_of_hours_price) ?? 0,
      sub_total: toNum(payload.sub_total) ?? 0,
      tax: toNum(payload.tax) ?? 0,
      vat: toNum(payload.vat),
      vat_price: toNum(payload.vat_price),
      total: toNum(payload.total) ?? 0,
      default_total: toNum(payload.default_total),
      change_total: toNum(payload.change_total),
      deposit: toNum(payload.deposit) ?? 0,
      parking_before_discount: toNum(payload.parking_before_discount) ?? 0,
      extra_before_discount: toNum(payload.extra_before_discount) ?? 0,
      sub_total_before_discount: toNum(payload.sub_total_before_discount) ?? 0,
      account_discount: toNum(payload.account_discount) ?? 0,
      discount: toNum(payload.discount) ?? 0,
      discount_code: payload.discount_code || null,
    },

    location: payload.location,
    space_name: payload.space_name,

    currency: {
      sign: payload.currency?.sign || null,
      value: payload.currency?.value || null,
    },

    vehicle: {
      regno: payload.c_regno || null,
      make: payload.c_make || null,
      model: payload.c_model || null,
    },

    customer: {
      title: payload.c_title || null,
      name: payload.c_name || null,
      phone: payload.c_phone || null,
      email: payload.c_email || null,
      company: payload.c_company || null,
      notes: payload.c_notes || null,
      address: payload.c_address || null,
      city: payload.c_city || null,
      state: payload.c_state || null,
      zip: payload.c_zip || null,
      country: payload.c_country || null,
      pax: payload.c_pax || null,
    },
    rawSourceData: payload,
  };
}

async function upsertBooking(doc) {
  if (!doc.externalBookingId)
    return { skipped: true, reason: "no externalBookingId" };
  const res = await Booking.findOneAndUpdate(
    { externalBookingId: doc.externalBookingId },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { upsertedId: res._id.toString() };
}

export async function fetchAndIngest() {
  const start = Date.now();
  console.log(`[BookingsCron] Fetch started @ ${new Date().toISOString()}`);

  const { data } = await axios.get(GET_BOOKINGS, { timeout: 20_000 });
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  if (!Array.isArray(items)) {
    console.warn("[BookingsCron] Unexpected response shape. No items array.");
    return { fetched: 0, upserts: 0, errors: 0 };
  }

  let upserts = 0;
  let errors = 0;

  // simple concurrency control
  const concurrency = 10;
  const queue = [...items];

  async function worker() {
    while (queue.length) {
      const raw = queue.shift();
      try {
        const doc = mapExternalBooking(raw);
        const { upsertedId } = await upsertBooking(doc);

        if (upsertedId) {
          let bookingDoc = await Booking.findById(upsertedId);

          if (bookingDoc.status === "confirmed" && !bookingDoc.tripId) {
            const user = await ensureCustomerFromBooking(bookingDoc);

            bookingDoc.pickup = {
              address: "6600 S Terminal Pkwy",
              location: {
                type: "Point",
                coordinates: [-84.44663540190344, 33.64134931267701],
              },
            };

            bookingDoc.dropoff = {
              address: "6600 S Terminal Pkwy",
              location: {
                type: "Point",
                coordinates: [-84.44663540190344, 33.64134931267701],
              },
            };

            if (user) {
              await createTripFromBooking(bookingDoc, user);
            }
          }

          upserts++;
        }
      } catch (e) {
        errors += 1;
        console.error("[BookingsCron] upsert error:", e?.message);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[BookingsCron] Fetch done — fetched=${items.length}, upserts=${upserts}, errors=${errors}, duration=${elapsed}s`,
  );
  return { fetched: items.length, upserts, errors };
}
