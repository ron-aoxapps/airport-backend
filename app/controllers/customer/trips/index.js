import { sendSuccess, sendError } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import Transaction from "../../../models/Transaction.js";
import Trip from "../../../models/Trips.js";
import PromoCode from "../../../models/promoCodes.js";
import Car from "../../../models/Cars.js";
import ParkingSpace from "../../../models/parkingSpaces.js";
import Booking from "../../../models/Booking.js";
import User from "../../../models/User.js";
import * as constants from "../../../constants/index.js";
import { notifyNearbyDrivers } from "../../../helpers/notifyDrivers.js";

import {
  isBlank,
  parseDateSafe,
  buildStop,
  ceilDays,
  computePromoDiscount,
  resolveExtrasLineItems,
  canUseTransactions,
  reservePromoNoTxn,
  releasePromoReservationNoTxn,
} from "../../../utils/trip.js";
import mongoose from "mongoose";
import Review from "../../../models/Review.js";
import { updateUserRatingSummary } from "../../../helpers/rating.js";
import { getIO } from "../../../socket/index.js";
import { SOCKET_EVENTS } from "../../../constants/socketEvents.js";
import { createAndEmitNotification } from "../../../utils/sendNotification.js";
// import { sendPushNotificationDriver } from "../../../helpers/pushNotification.js";

const tripController = {};

tripController.createTrip = async (req, res) => {
  const userId = req.userId;
  const { bookingId, parkingSpaceId, metadata } = req.body || {};

  try {
    // Validate required fields
    if (!bookingId) {
      return sendError(res, {}, "bookingId is required.", CODES.BAD_REQUEST);
    }

    if (!parkingSpaceId) {
      return sendError(
        res,
        {},
        "parkingSpaceId is required.",
        CODES.BAD_REQUEST,
      );
    }

    // Fetch the booking
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) {
      return sendError(res, {}, "Booking not found.", CODES.NOT_FOUND);
    }

    // Check if booking already has a trip
    if (booking.tripId) {
      return sendError(
        res,
        {},
        "Trip already exists for this booking.",
        CODES.BAD_REQUEST,
      );
    }

    // Verify parking space exists and get location
    const parkingSpace = await ParkingSpace.findById(parkingSpaceId)
      .populate("locationId", "coordinates")
      .lean();
    if (!parkingSpace) {
      return sendError(res, {}, "Parking space not found.", CODES.NOT_FOUND);
    }

    // Create the trip
    const newTrip = await Trip.create({
      customerId: userId,
      bookingId: bookingId,
      parkingSpaceId: parkingSpaceId,
      tripStatus: constants.TRIP_FINDING,
      tripConfirmedAt: new Date(),
      metadata: metadata || {},
    });

    // Update the booking with the tripId
    await Booking.findByIdAndUpdate(bookingId, {
      tripId: newTrip._id,
    });

    const user = await User.findById(userId);

    const nearByDrivers = await User.find({
      role: "driver",
      driverStatus: constants.DRIVER_FINDING_TRIPS,
      isVerified: true,
    }).select("_id firebaseToken driverStatus");

    await Trip.findByIdAndUpdate(newTrip._id, {
      nearByTempDrivers: nearByDrivers.map((d) => d._id),
      isDriverFound: nearByDrivers.length ? "yes" : "no",
    });

    if (nearByDrivers.length > 0) {
      await notifyNearbyDrivers({
        drivers: nearByDrivers,
        trip: newTrip,
        customerName: user.name,
      });
    }

    return sendSuccess(
      res,
      newTrip,
      "Trip created successfully.",
      CODES.CREATED,
    );
  } catch (err) {
    console.error("Create Trip Error:", err);
    return sendError(res, {}, err.message || err, CODES.BAD_REQUEST);
  }
};

tripController.cancelTripNoDriver = async (req, res) => {
  const userId = req.userId;
  const { tripId } = req.body || {};

  try {
    if (!tripId) {
      return sendError(res, {}, "tripId is required.", CODES.BAD_REQUEST);
    }

    // Find the trip
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);
    }

    // Verify the trip belongs to the user
    if (trip.customerId.toString() !== userId) {
      return sendError(
        res,
        {},
        "Unauthorized to cancel this trip.",
        CODES.UNAUTHORIZED,
      );
    }

    if (trip.tripStatus !== constants.TRIP_FINDING) {
      return sendError(
        res,
        {},
        "Trip can only be cancelled when in FindingDrivers status.",
        CODES.BAD_REQUEST,
      );
    }

    // Check if at least 1 minute has passed since trip creation
    const oneMinuteAgo = new Date(Date.now() - 60000);
    if (trip.createdAt > oneMinuteAgo) {
      return sendError(
        res,
        {},
        "Please wait at least 1 minute before cancelling the trip.",
        CODES.BAD_REQUEST,
      );
    }

    trip.tripStatus = constants.TRIP_NO_DRIVER_FOUND;
    trip.cancelledAt = new Date();
    trip.cancelReason = "No driver accepted within the timeout period";
    await trip.save();

    // Clear the tripId from the booking so user can create a new trip
    await Booking.findByIdAndUpdate(trip.bookingId, {
      tripId: null,
    });

    return sendSuccess(
      res,
      trip,
      "Trip cancelled due to no driver found. You can create a new trip request.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Cancel Trip No Driver Error:", err);
    return sendError(res, {}, err.message || err, CODES.BAD_REQUEST);
  }
};

tripController.getTripPrice = async (req, res) => {
  const userid = req.userId;
  try {
    const {
      vehicleId, // optional
      parkingSpaceId,

      pickUp, // { address, lat, lng, when }
      dropOff, // { address, lat, lng, when }

      extras, // [{ serviceId, qty }]
      promoCode, // string CODE or ObjectId

      lateHourCharges = 0,
      lastHourCharges = 0,
      tax = 0,
      taxPercent,
      currency = "USD",
    } = req.body || {};

    if (!parkingSpaceId)
      return sendError(
        res,
        {},
        "parkingSpaceId is required.",
        CODES.BAD_REQUEST,
      );

    const pickupStop = buildStop(pickUp);
    const dropoffStop = buildStop(dropOff);

    if (!pickupStop.when)
      return sendError(
        res,
        {},
        "pickUp.when is required (ISO).",
        CODES.BAD_REQUEST,
      );
    if (!dropoffStop.when)
      return sendError(
        res,
        {},
        "dropOff.when is required (ISO).",
        CODES.BAD_REQUEST,
      );

    // Base rate from ParkingSpace
    const ps = await ParkingSpace.findById(parkingSpaceId)
      .populate({
        path: "assignedExtras.extra",
        model: "Extra",
        select: "_id name price status",
      })
      .lean();
    if (!ps)
      return sendError(res, {}, "Parking space not found.", CODES.NOT_FOUND);

    const daily = Number(ps.defaultPrice || 0);
    const days = ceilDays(pickupStop.when, dropoffStop.when);
    const base = daily * days;

    // Required extras from parking space
    const requiredMap = new Map();
    (ps.assignedExtras || []).forEach((ax) => {
      if (ax?.extra?._id)
        requiredMap.set(String(ax.extra._id), !!ax.isRequired);
    });

    // Extras snapshot
    const { items: extraItems, extrasTotal } = await resolveExtrasLineItems(
      extras,
      requiredMap,
    );

    // Optional vehicle existence check
    if (vehicleId) {
      const exists = await Car.findById(vehicleId).select("_id").lean();
      if (!exists)
        return sendError(res, {}, "Vehicle not found.", CODES.BAD_REQUEST);
    }

    // Promo validation (no side-effects)
    let promoDoc = null;
    if (!isBlank(promoCode)) {
      if (mongoose.Types.ObjectId.isValid(String(promoCode))) {
        promoDoc = await PromoCode.findById(promoCode);
      } else if (typeof promoCode === "string") {
        promoDoc = await PromoCode.findOne({
          code: String(promoCode).trim().toUpperCase(),
        });
      }
      if (!promoDoc)
        return sendError(res, {}, "Promo code not found.", CODES.BAD_REQUEST);

      const now = new Date();
      if (promoDoc.visible === false)
        return sendError(res, {}, "Promo code is hidden.", CODES.BAD_REQUEST);
      if (promoDoc.validFrom && promoDoc.validFrom > now)
        return sendError(
          res,
          {},
          "Promo code not yet active.",
          CODES.BAD_REQUEST,
        );
      if (promoDoc.validUntil && promoDoc.validUntil < now)
        return sendError(res, {}, "Promo code expired.", CODES.BAD_REQUEST);
      if (
        promoDoc.limit != null &&
        promoDoc.used != null &&
        promoDoc.used >= promoDoc.limit
      )
        return sendError(
          res,
          {},
          "Promo usage limit reached.",
          CODES.BAD_REQUEST,
        );
    }

    // Pricing math (identical to create)
    let pricing = {
      base,
      extras: extrasTotal,
      lateHourCharges: Number(lateHourCharges || 0),
      lastHourCharges: Number(lastHourCharges || 0),
      tax: 0,
      discount: 0,
      total: 0,
      currency,
    };

    const subBeforeDiscount =
      pricing.base +
      pricing.extras +
      pricing.lateHourCharges +
      pricing.lastHourCharges;

    if (promoDoc)
      pricing.discount = computePromoDiscount(promoDoc, subBeforeDiscount);

    if (!isBlank(taxPercent)) {
      const baseForTax = Math.max(0, subBeforeDiscount - pricing.discount);
      pricing.tax = Number(
        ((Number(taxPercent) / 100) * baseForTax).toFixed(2),
      );
    } else {
      pricing.tax = Number(tax || 0);
    }

    pricing.total = Math.max(
      0,
      subBeforeDiscount - pricing.discount + pricing.tax,
    );

    // Response payload
    return sendSuccess(
      res,
      {
        quote: {
          parkingSpaceId: ps._id,
          parkingSpaceName: ps.name,
          dailyRate: daily,
          days,
          pickupWhen: pickupStop.when,
          dropoffWhen: dropoffStop.when,
          extras: extraItems,
          promoApplied: promoDoc
            ? { _id: promoDoc._id, code: promoDoc.code }
            : null,
          pricing,
        },
      },
      "Trip quote generated.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Get Trip Quote Error:", err);
    return sendError(res, {}, err.message || err, CODES.BAD_REQUEST);
  }
};

tripController.getTripById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return sendError(res, {}, "Invalid trip id.", CODES.BAD_REQUEST);
    }

    const trip = await Trip.findById(id)
      .select(
        "_id customerId driverId bookingId parkingSpaceId tripStatus parked returnDriverId createdAt pickup dropoff additionalNotes tripOTP",
      )
      .populate([
        {
          path: "customerId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "driverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "returnDriverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "bookingId",
          model: "Booking",
          select: {
            from: 1,
            to: 1,
            vehicle: 1,
            "customer.phone": 1,
            "customer.notes": 1,
            "customer.address": 1,
            "customer.city": 1,
            "customer.state": 1,
            "customer.zip": 1,
            "customer.country": 1,
            "pricing.total": 1,
          },
        },
        {
          path: "parkingSpaceId",
          model: "ParkingSpace",
          select: "_id name locationId",
          populate: [
            {
              path: "locationId",
              model: "ParkingLocation",
              select: "_id name address coordinates",
            },
          ],
        },
      ])
      .lean();

    if (!trip) {
      return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);
    }

    // -----------------------------------
    // Helper: Attach rating to driver
    // -----------------------------------
    const attachDriverRating = async (driverObj) => {
      if (!driverObj?._id) return;

      const ratingData = await Review.aggregate([
        {
          $match: {
            driverId: driverObj._id,
            author: "customer",
          },
        },
        {
          $group: {
            _id: "$driverId",
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);

      if (ratingData.length > 0) {
        driverObj.rating = Number(ratingData[0].averageRating.toFixed(1));
        driverObj.totalReviews = ratingData[0].totalReviews;
      } else {
        driverObj.rating = 0;
        driverObj.totalReviews = 0;
      }
    };

    // Attach ratings
    await attachDriverRating(trip.driverId);
    await attachDriverRating(trip.returnDriverId);

    return sendSuccess(res, trip, "Trip fetched successfully.", CODES.OK);
  } catch (err) {
    console.error("Get Trip By Id Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.requestPickup = async (req, res) => {
  try {
    const customerId = req.userId;
    const { tripId } = req.params;
    const { lat, lng } = req.body;

    if (!tripId || !mongoose.Types.ObjectId.isValid(String(tripId))) {
      return sendError(res, {}, "Valid tripId is required.", CODES.BAD_REQUEST);
    }

    if (lat === undefined || lng === undefined) {
      return sendError(
        res,
        {},
        "Latitude and Longitude required.",
        CODES.BAD_REQUEST,
      );
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);
    }

    if (String(trip.customerId) !== String(customerId)) {
      return sendError(
        res,
        {},
        "Unauthorized: Not your trip.",
        CODES.UNAUTHORIZED,
      );
    }

    /*
      ============================================
      STEP 1: ALWAYS UPDATE PICKUP LOCATION
      ============================================
    */

    trip.pickup = {
      address: "Arrived at airport",
      location: {
        type: "Point",
        coordinates: [Number(lng), Number(lat)], // GeoJSON: [lng, lat]
      },
    };

    trip.lastSearchAt = new Date();
    await trip.save();

    const user = await User.findById(customerId).select("name");

    /*
      ============================================
      CASE 1: DRIVER ALREADY ASSIGNED
      ============================================
    */

    if (trip.driverId) {
      const driver = await User.findById(trip.driverId).select(
        "_id firebaseToken",
      );

      // Notify only if driver is assigned AND this is a pickup request
      if (driver?.firebaseToken) {
        await sendPushNotification({
          token: driver.firebaseToken,
          title: "Pickup Request",
          body: `${user.name} has arrived at the airport and is requesting pickup.`,
          data: {
            tripId: trip._id.toString(),
            type: "PICKUP_REQUEST",
          },
        });
      }

      return sendSuccess(
        res,
        {},
        "Pickup location updated successfully.",
        CODES.OK,
      );
    }

    /*
      ============================================
      CASE 2: NO DRIVER ASSIGNED → FIND NEARBY
      ============================================
    */

    const nearByDrivers = await User.find({
      role: "driver",
      driverStatus: constants.DRIVER_FINDING_TRIPS,
      isVerified: true,
    }).select("_id firebaseToken driverStatus");

    await Trip.findByIdAndUpdate(trip._id, {
      nearByTempDrivers: nearByDrivers.map((d) => d._id),
      isReturnDriverFound: nearByDrivers.length ? "yes" : "no",
    });

    if (nearByDrivers.length > 0) {
      await notifyNearbyDrivers({
        drivers: nearByDrivers,
        trip: trip,
        customerName: user.name,
      });
    }

    try {
      const io = req.app.get("io");

      let driverCount = 0;

      // If driver already assigned
      if (trip.driverId) {
        driverCount = 1;
      } else {
        driverCount = nearByDrivers?.length || 0;
      }

      const adminMessage =
        driverCount > 0
          ? `Customer ${user?.name} has reached the airport and is requesting vehicle pickup.`
          : `Customer ${user?.name} has reached the airport and is requesting vehicle pickup.`;

      const adminNotification = {
        type: "TRIP",
        message: adminMessage,
        meta: {
          userId: customerId,
          link: "/trips",
          tripId: trip._id,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error(
        "Admin Pickup Request Notification Error:",
        adminNotifyErr.message,
      );
    }

    return sendSuccess(
      res,
      {},
      nearByDrivers.length
        ? "Pickup updated. Searching for nearby drivers..."
        : "Pickup updated. No drivers available at the moment.",
      CODES.OK,
    );
  } catch (err) {
    console.error("requestPickup Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.requestDropoff = async (req, res) => {
  try {
    const customerId = req.userId;
    const { tripId } = req.params;
    const { address, coordinates, additionalNotes } = req.body || {};

    if (!tripId || !mongoose.Types.ObjectId.isValid(String(tripId))) {
      return sendError(res, {}, "Valid tripId is required.", CODES.BAD_REQUEST);
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);
    }

    if (String(trip.customerId) !== String(customerId)) {
      return sendError(
        res,
        {},
        "Unauthorized: Not your trip.",
        CODES.UNAUTHORIZED,
      );
    }

    if (!trip.parked || trip.tripStatus !== constants.TRIP_PARKED) {
      return sendError(
        res,
        {},
        "Cannot request dropoff until the car is parked.",
        CODES.BAD_REQUEST,
      );
    }

    if (trip.isReturnDriverFound && trip.returnDriverId) {
      return sendError(
        res,
        {},
        "Driver already assigned for drop off.",
        CODES.BAD_REQUEST,
      );
    }

    // Throttle retry (60 sec)
    if (trip.lastSearchAt && Date.now() - trip.lastSearchAt.getTime() < 60000) {
      return sendError(
        res,
        {},
        "Please wait before retrying dropoff driver search.",
        CODES.BAD_REQUEST,
      );
    }

    // -------------------------------
    // Helpers
    // -------------------------------
    const isValidString = (val) => typeof val === "string" && val.trim() !== "";

    const isValidCoordinates = (coords) =>
      Array.isArray(coords) &&
      coords.length === 2 &&
      coords.every((c) => typeof c === "number");

    // -------------------------------
    // Build Dynamic Update Object
    // -------------------------------
    const updateFields = {};

    // Update dropoff only if at least one valid field exists
    if (isValidString(address) || isValidCoordinates(coordinates)) {
      updateFields.dropoff = {
        ...(trip.dropoff || {}),
      };

      if (isValidString(address)) {
        updateFields.dropoff.address = address.trim();
      }

      if (isValidCoordinates(coordinates)) {
        updateFields.dropoff.location = {
          type: "Point",
          coordinates,
        };
      }
    }

    // Optional notes update
    if (isValidString(additionalNotes)) {
      updateFields.additionalNotes = additionalNotes.trim();
    }

    // Always update search metadata
    updateFields.lastSearchAt = new Date();
    updateFields.searchRound = (trip.searchRound || 0) + 1;

    // Apply update
    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      { $set: updateFields },
      { new: true },
    );

    // -------------------------------
    // Find Nearby Drivers
    // -------------------------------
    const user = await User.findById(customerId);

    const nearByDrivers = await User.find({
      role: "driver",
      driverStatus: constants.DRIVER_FINDING_TRIPS,
      isVerified: true,
    }).select("_id firebaseToken driverStatus");

    const driverIds = nearByDrivers.map((d) => d._id);

    await Trip.findByIdAndUpdate(tripId, {
      $set: {
        nearByTempDrivers: driverIds,
        isReturnDriverFound: driverIds.length ? "yes" : "no",
      },
    });

    if (nearByDrivers.length > 0) {
      await notifyNearbyDrivers({
        drivers: nearByDrivers,
        trip: updatedTrip,
        customerName: user?.name || "Customer",
      });
    }

    // ================= ADMIN NOTIFICATION =================

    try {
      const io = req.app.get("io");

      const driverCount = nearByDrivers.length;

      const adminMessage =
        driverCount > 0
          ? `Customer ${user?.name} has requested for the vehicle . ${driverCount} driver(s) found for return. `
          : `Customer ${user?.name} has requested for the vehicle. No drivers available for return.`;

      const adminNotification = {
        type: "TRIP",
        message: adminMessage,
        meta: {
          userId: customerId,
          link: "/trips",
          tripId: tripId,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error(
        "Admin Dropoff Request Notification Error:",
        adminNotifyErr.message,
      );
    }

    return sendSuccess(
      res,
      updatedTrip,
      `Searching for return drivers (Round ${updateFields.searchRound})...`,
      CODES.OK,
    );
  } catch (err) {
    console.error("requestDropoff Error:", err);
    return sendError(
      res,
      {},
      err.message || "Internal Server Error",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

tripController.verifyTripOTPForPickUp = async (req, res) => {
  try {
    const customerId = req.userId;
    const { tripId, tripOTP } = req.body || {};

    if (!tripId)
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    if (
      tripOTP === undefined ||
      tripOTP === null ||
      String(tripOTP).trim() === ""
    ) {
      return sendError(res, {}, "OTP is required.", CODES.BAD_REQUEST);
    }

    const snapshot = await Trip.findById(tripId)
      .select("_id tripStatus customerId driverId tripOTP tripOTPExpire")
      .populate([
        { path: "customerId", model: "User", select: "_id name firebaseToken" },
        { path: "driverId", model: "User", select: "_id name firebaseToken" },
      ])
      .lean();

    if (!snapshot)
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);

    if (
      !snapshot.customerId ||
      String(snapshot.customerId._id) !== String(customerId)
    ) {
      return sendError(
        res,
        {},
        "Not authorized to verify this trip.",
        CODES.FORBIDDEN,
      );
    }

    if (snapshot.tripStatus !== constants.TRIP_ARRIVED) {
      return sendError(
        res,
        {},
        "OTP can only be verified after driver arrival.",
        CODES.BAD_REQUEST,
      );
    }

    if (!snapshot.tripOTP) {
      return sendError(
        res,
        {},
        "No OTP issued for this trip yet.",
        CODES.BAD_REQUEST,
      );
    }
    // if (
    //   snapshot.tripOTPExpire &&
    //   new Date(snapshot.tripOTPExpire).getTime() < Date.now()
    // ) {
    //   return sendError(
    //     res,
    //     {},
    //     {},
    //     "OTP has expired. Please request a new one.",
    //     CODES.BAD_REQUEST,
    //   );
    // }

    // Compare as string
    const provided = String(tripOTP).trim();
    const expected = String(snapshot.tripOTP).trim();
    if (provided !== expected) {
      return sendError(res, {}, "Invalid OTP.", CODES.BAD_REQUEST);
    }

    const updated = await Trip.findOneAndUpdate(
      { _id: tripId, customerId }, // ensure same customer
      {
        $set: {
          verified: true,
          pickedUpAt: new Date(),
          tripStatus: constants.TRIP_PARKING_INROUTE,
        },
        $unset: {
          tripOTP: 1,
          tripOTPExpire: 1,
        },
      },
      { new: true },
    ).populate([
      {
        path: "customerId",
        model: "User",
        select: "_id name email phone firebaseToken",
      },
      {
        path: "driverId",
        model: "User",
        select: "_id name email phone firebaseToken",
      },
    ]);

    if (!updated) {
      return sendError(
        res,
        {},
        "Trip not available to update.",
        CODES.BAD_REQUEST,
      );
    }

    const io = req.app.get("io");

    // ✅ Emit socket
    try {
      if (io && updated?.driverId?._id) {
        io.to(String(updated?.driverId?._id)).emit(
          SOCKET_EVENTS.TRIP_PARKING_INROUTE,
          {
            tripId: updated._id,
            tripStatus: updated.tripStatus,
            message: "OTP verified. Trip is now 'ParkingInRoute'.",
          },
        );
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ===== Push notifications (keep SAME pattern) =====
    try {
      // Notify Customer
      const c = updated.customerId;
      const d = updated.driverId;
      if (
        c?.firebaseToken &&
        c.firebaseToken !== "" &&
        c.firebaseToken !== "none"
      ) {
        const title = "TRIP_PARKING_IN_ROUTE";
        const body = `Driver ${
          d?.name || "your driver"
        } has verified your OTP. Your vehicle is now en route to the parking location.`;
        const registrationToken = c.firebaseToken;

        // keep your existing helper signature
        helper.sendPushNotificationCustomer(title, body, registrationToken);
      }
    } catch (e) {
      console.error("Customer push error:", e?.message || e);
    }

    try {
      // Notify Driver
      const d = updated.driverId;
      if (
        d?.firebaseToken &&
        d.firebaseToken !== "" &&
        d.firebaseToken !== "none"
      ) {
        const title = "TRIP_PARKING_IN_ROUTE";
        const body = "OTP verified by customer. Proceed to parking.";
        const registrationToken = d.firebaseToken;

        // keep your existing helper signature
        helper.sendPushNotificationDriver(title, body, registrationToken);
      }
    } catch (e) {
      console.error("Driver push error:", e?.message || e);
    }

    return sendSuccess(
      res,
      updated,
      "OTP verified. Trip marked as 'ParkingInRoute'.",
      CODES.OK,
    );
  } catch (err) {
    console.error("verifyTripOTP Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.regenerateTripOTP = async (req, res) => {
  try {
    const customerId = req.userId;
    const { tripId } = req.body || {};

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const trip = await Trip.findById(tripId)
      .select("_id tripStatus customerId driverId")
      .populate([
        { path: "customerId", model: "User", select: "_id name firebaseToken" },
        { path: "driverId", model: "User", select: "_id name firebaseToken" },
      ]);

    if (!trip) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    if (String(trip.customerId._id) !== String(customerId)) {
      return sendError(
        res,
        {},
        "Not authorized to regenerate OTP.",
        CODES.FORBIDDEN,
      );
    }

    // Allow regeneration only before pickup
    if (trip.tripStatus !== constants.TRIP_ARRIVED) {
      return sendError(
        res,
        {},
        "OTP can only be regenerated after driver arrival.",
        CODES.BAD_REQUEST,
      );
    }

    // 🔐 Generate 4-digit OTP
    const newOTP = Math.floor(1000 + Math.random() * 9000);

    const expiryMinutes = 5; // configurable
    const expireAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    trip.tripOTP = newOTP;
    trip.tripOTPExpire = expireAt;

    await trip.save();

    return sendSuccess(
      res,
      { tripId: trip._id },
      "New OTP generated successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("regenerateTripOTP Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.createDropoffDriverReviewByCustomer = async (req, res) => {
  try {
    const customerId = req.userId;
    const tripId = req.params.id;
    const { rating, feedback = "" } = req.body || {};

    if (!tripId)
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    if (rating === undefined || rating === null)
      return sendError(res, {}, "Rating is required.", CODES.BAD_REQUEST);
    if (Number(rating) < 0 || Number(rating) > 5)
      return sendError(
        res,
        {},
        "Rating must be between 0 and 5.",
        CODES.BAD_REQUEST,
      );

    const trip = await Trip.findById(tripId)
      .select("_id customerId driverId tripStatus returnDriverId")
      .lean();
    if (!trip) return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);

    if (!trip.customerId || String(trip.customerId) !== String(customerId))
      return sendError(
        res,
        {},
        "Not authorized for this trip.",
        CODES.FORBIDDEN,
      );

    if (trip.tripStatus !== constants.TRIP_COMPLETED)
      return sendError(
        res,
        {},
        "You can only review a completed trip.",
        CODES.BAD_REQUEST,
      );

    if (!trip.returnDriverId)
      return sendError(
        res,
        {},
        "No driver associated with this trip.",
        CODES.BAD_REQUEST,
      );

    // one review per side
    const exists = await Review.findOne({ tripId, author: "customer" }).lean();
    if (exists)
      return sendError(
        res,
        {},
        "You already reviewed this trip.",
        CODES.CONFLICT,
      );

    const doc = await Review.create({
      tripId,
      driverId: trip.returnDriverId,
      customerId: trip.customerId,
      author: "customer",
      rating: Number(rating),
      feedback: String(feedback).trim(),
      reviewStage: "dropoff",
    });

    updateUserRatingSummary(trip.driverId).catch(() => {});

    // ================= ADMIN NOTIFICATION =================

    try {
      const io = req.app.get("io");

      // Fetch customer name
      const customer = await User.findById(customerId).select("name").lean();

      const customerName = customer?.name || "Customer";

      const reviewMessage = `${customerName} rated the driver ${Number(
        rating,
      )} star(s) for dropoff`;

      const adminNotification = {
        type: "TRIP",
        message: reviewMessage,
        meta: {
          userId: customerId,
          link: "/trips",
          message: reviewMessage,
          rating: Number(rating),
          tripId,
          customerName,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error("Admin Review Notification Error:", adminNotifyErr.message);
    }

    return sendSuccess(res, doc, "Review submitted.", CODES.CREATED);
  } catch (err) {
    console.error("createDriverReviewByCustomer error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.getCompletedTripsByCustomer = async (req, res) => {
  try {
    const customerId = req.userId;
    const { page = 1, limit = 10 } = req.query;

    const filter = { customerId, tripStatus: constants.TRIP_COMPLETED };

    const trips = await Trip.find(filter)
      .select(
        "_id customerId driverId bookingId parkingSpaceId tripStatus parked returnDriverId createdAt pickup dropoff additionalNotes",
      )
      .populate([
        {
          path: "customerId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "driverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "returnDriverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "bookingId",
          model: "Booking",
          select: {
            from: 1,
            to: 1,
            vehicle: 1,
            "customer.phone": 1,
            "customer.notes": 1,
            "customer.address": 1,
            "customer.city": 1,
            "customer.state": 1,
            "customer.zip": 1,
            "customer.country": 1,

            "pricing.total": 1,
          },
        },

        {
          path: "parkingSpaceId",
          model: "ParkingSpace",
          select: "_id name locationId",
          populate: [
            {
              path: "locationId",
              model: "ParkingLocation",
              select: "_id name address coordinates",
            },
          ],
        },
      ])
      .sort({ droppedOffAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Trip.countDocuments(filter);

    return sendSuccess(
      res,
      {
        trips,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Completed trips fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getCompletedTripsByCustomer Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.getActiveReservationsByCustomer = async (req, res) => {
  try {
    const customerId = req.userId;
    const { page = 1, limit = 10 } = req.query;
    const status = req.query.status;

    const ACTIVE_TRIP_STATUSES = [
      constants.TRIP_FINDING,
      constants.TRIP_PICKUP_INROUTE,
      constants.TRIP_ARRIVED,
      constants.TRIP_PARKING_INROUTE,

      // constants.TRIP_PENDING,
      constants.TRIP_PARKED,
      constants.TRIP_ACCEPTED,
      constants.TRIP_RETURN_INROUTE,
      constants.TRIP_RETURN_ARRIVED,
    ];

    const filter = {
      customerId,
      // tripStatus: { $in: ACTIVE_TRIP_STATUSES },
    };

    if(status) {
      filter.tripStatus = status;
    }else{
      filter.tripStatus = { $in: ACTIVE_TRIP_STATUSES };
    }

    const trips = await Trip.find(filter)
      .select(
        "_id customerId driverId bookingId parkingSpaceId tripStatus parked returnDriverId createdAt pickup dropoff additionalNotes",
      )
      .populate([
        {
          path: "customerId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "driverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "returnDriverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "bookingId",
          model: "Booking",
          select: {
            from: 1,
            to: 1,
            vehicle: 1,
            "customer.phone": 1,
            "customer.notes": 1,
            "customer.address": 1,
            "customer.city": 1,
            "customer.state": 1,
            "customer.zip": 1,
            "customer.country": 1,

            "pricing.total": 1,
          },
        },

        {
          path: "parkingSpaceId",
          model: "ParkingSpace",
          select: "_id name locationId",
          populate: [
            {
              path: "locationId",
              model: "ParkingLocation",
              select: "_id name address coordinates",
            },
          ],
        },
      ])
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Trip.countDocuments(filter);

    return sendSuccess(
      res,
      {
        trips,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Active reservations fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getActiveReservationsByCustomer Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.getParkedVehiclesOfCustomer = async (req, res) => {
  try {
    const customerId = req.userId;
    const { page = 1, limit = 10 } = req.query;

    const filter = {
      customerId,
      tripStatus: constants.TRIP_PARKED,
      parked: true,
    };

    const trips = await Trip.find(filter)
      .select(
        "_id customerId driverId bookingId parkingSpaceId tripStatus parked returnDriverId createdAt pickup dropoff additionalNotes",
      )
      .populate([
        {
          path: "customerId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "driverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "returnDriverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location",
        },
        {
          path: "bookingId",
          model: "Booking",
          select: {
            from: 1,
            to: 1,
            vehicle: 1,
            "customer.phone": 1,
            "customer.notes": 1,
            "customer.address": 1,
            "customer.city": 1,
            "customer.state": 1,
            "customer.zip": 1,
            "customer.country": 1,

            "pricing.total": 1,
          },
        },

        {
          path: "parkingSpaceId",
          model: "ParkingSpace",
          select: "_id name locationId",
          populate: [
            {
              path: "locationId",
              model: "ParkingLocation",
              select: "_id name address coordinates",
            },
          ],
        },
      ])
      .sort({ parkedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Trip.countDocuments(filter);

    return sendSuccess(
      res,
      {
        trips,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Active reservations fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getActiveReservationsByCustomer Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.updatePickupLocation = async (req, res) => {
  try {
    const customerId = req.userId;

    const { address, coordinates, tripId } = req.body;

    if (!tripId || !mongoose.Types.ObjectId.isValid(String(tripId))) {
      return sendError(res, {}, "Valid tripId is required.", CODES.BAD_REQUEST);
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);
    }

    if (String(trip.customerId) !== String(customerId)) {
      return sendError(
        res,
        {},
        "Unauthorized: Not your trip.",
        CODES.UNAUTHORIZED,
      );
    }

    // -------------------------------
    // Validators
    // -------------------------------
    const isValidString = (val) => typeof val === "string" && val.trim() !== "";

    const isValidCoordinates = (coords) =>
      Array.isArray(coords) &&
      coords.length === 2 &&
      coords.every((c) => typeof c === "number");

    if (!isValidString(address) && !isValidCoordinates(coordinates)) {
      return sendError(
        res,
        {},
        "Provide valid address or coordinates to update.",
        CODES.BAD_REQUEST,
      );
    }

    // -------------------------------
    // Build Update Object
    // -------------------------------
    const updateFields = {
      pickup: {
        ...(trip.pickup || {}),
      },
    };

    if (isValidString(address)) {
      updateFields.pickup.address = address.trim();
    }

    if (isValidCoordinates(coordinates)) {
      updateFields.pickup.location = {
        type: "Point",
        coordinates,
      };
    }

    updateFields.updatedAt = new Date();

    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      { $set: updateFields },
      { new: true },
    );

    return sendSuccess(
      res,
      updatedTrip,
      "Pickup location updated successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("updatePickupLocation Error:", err);
    return sendError(
      res,
      {},
      err.message || "Internal Server Error",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

tripController.getTripTransactionsByCustomer = async (req, res) => {
  try {
    const customerId = req.userId;
    const { page = 1, limit = 10 } = req.query;

    const filter = { customerId };

    const trips = await Trip.find(filter)
      .select("_id tripStatus bookingId createdAt droppedOffAt parkingSpaceId")
      .populate([
        {
          path: "bookingId",
          model: "Booking",
          select: "pricing from to vehicle",
        },
        {
          path: "parkingSpaceId",
          model: "ParkingSpace",
          select: "_id name",
        },
      ])
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Transform into transaction structure
    const transactions = trips.map((trip) => ({
      tripId: trip._id,
      tripStatus: trip.tripStatus,
      bookingId: trip.bookingId?._id || null,
      pricing: trip.bookingId?.pricing || {},
      parkingSpace: trip.parkingSpaceId
        ? {
            id: trip.parkingSpaceId._id,
            name: trip.parkingSpaceId.name,
          }
        : null,
      createdAt: trip.createdAt,
      completedAt: trip.droppedOffAt || null,
    }));

    const total = await Trip.countDocuments(filter);

    return sendSuccess(
      res,
      {
        transactions,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Trip transactions fetched successfully",
      CODES.OK,
    );
  } catch (err) {
    console.error("getTripTransactionsByCustomer Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

export default tripController;
