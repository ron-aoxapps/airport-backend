import tripTable from "../../../models/Trips.js";
import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import * as constants from "../../../constants/index.js";
import { TRIP_STATUS_GROUPS } from "../../../constants/index.js";
import mongoose from "mongoose";
import User from "../../../models/User.js";
import { notifyNearbyDrivers } from "../../../helpers/notifyDrivers.js";

const tripController = {};

tripController.getAllTrips = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "createdAt",
      sortOrder = -1,
      status,
      startDate,
      endDate,
      minPrice,
      maxPrice,
      fromDate,
      toDate,
    } = req.query;

    const filter = {};

    /* ===============================
       Status Filter
    =============================== */
    if (status) {
      filter.tripStatus = status;
    }

    /* ===============================
       Created Date Filter
    =============================== */
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate && !isNaN(new Date(startDate)))
        filter.createdAt.$gte = new Date(startDate);
      if (endDate && !isNaN(new Date(endDate)))
        filter.createdAt.$lte = new Date(endDate);
    }

    /* ===============================
       Pickup Date Filter
    =============================== */
    if (fromDate || toDate) {
      const bookingFilter = {};

      if (fromDate && !isNaN(new Date(fromDate))) {
        bookingFilter.from = { $gte: new Date(fromDate) };
      }

      if (toDate && !isNaN(new Date(toDate))) {
        bookingFilter.to = {
          ...(bookingFilter.to || {}),
          $lte: new Date(toDate),
        };
      }

      const bookings = await mongoose
        .model("Booking")
        .find(bookingFilter)
        .select("_id");

      const bookingIds = bookings.map((b) => b._id);

      // Inject into main trip filter
      filter.bookingId = { $in: bookingIds };
    }

    /* ===============================
       Price Filter
    =============================== */
    if (minPrice || maxPrice) {
      filter.cost = {};
      if (minPrice) filter.cost.$gte = Number(minPrice);
      if (maxPrice) filter.cost.$lte = Number(maxPrice);
    }

    /* ===============================
       Search Logic FIXED
    =============================== */

    /* ===============================
   Search Logic (Trip + User + Booking)
=============================== */

    if (search) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);

      if (isObjectId) {
        filter._id = search;
      } else {
        // 1️⃣ Find matching users
        const usersPromise = mongoose
          .model("User")
          .find({
            $or: [
              { name: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
            ],
          })
          .select("_id");

        // 2️⃣ Find matching bookings by externalId
        const bookingsPromise = mongoose
          .model("Booking")
          .find({
            externalBookingId: { $regex: search, $options: "i" },
          })
          .select("_id");

        const [users, bookings] = await Promise.all([
          usersPromise,
          bookingsPromise,
        ]);

        const userIds = users.map((u) => u._id);
        const bookingIds = bookings.map((b) => b._id);

        filter.$or = [
          { customerId: { $in: userIds } },
          { driverId: { $in: userIds } },
          { returnDriverId: { $in: userIds } },
          { bookingId: { $in: bookingIds } },
        ];
      }
    }

    /* ===============================
       Query with Populate (UNCHANGED PATTERN)
    =============================== */

    const tripsPromise = tripTable
      .find(filter)
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
            "_id name email countryCode phoneNumber profilePicture location driverStatus",
        },
        {
          path: "returnDriverId",
          model: "User",
          select:
            "_id name email countryCode phoneNumber profilePicture location driverStatus",
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
          populate: {
            path: "locationId",
            model: "ParkingLocation",
            select: "_id name address coordinates",
          },
        },
      ])
      .sort({ [sortBy]: Number(sortOrder) })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    /* ===============================
       Stats (NOW CORRECT)
    =============================== */

    const statsPromise = tripTable.aggregate([
      // { $match: filter },
      {
        $facet: {
          totalTrips: [{ $count: "count" }],
          completedTrips: [
            { $match: { tripStatus: constants.TRIP_COMPLETED } },
            { $count: "count" },
          ],
          totalEarnings: [
            { $match: { tripStatus: constants.TRIP_COMPLETED } },
            { $group: { _id: null, total: { $sum: "$cost" } } },
          ],
          activeTrips: [
            { $match: { tripStatus: { $in: TRIP_STATUS_GROUPS.ONGOING } } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const [trips, statsResult] = await Promise.all([
      tripsPromise,
      statsPromise,
    ]);

    const stats = {
      totalTrips: statsResult[0]?.totalTrips[0]?.count || 0,
      completedTrips: statsResult[0]?.completedTrips[0]?.count || 0,
      totalEarnings: statsResult[0]?.totalEarnings[0]?.total || 0,
      activeTrips: statsResult[0]?.activeTrips[0]?.count || 0,
    };

    return sendSuccess(
      res,
      {
        trips,
        stats,
        pagination: {
          total: stats.totalTrips,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(stats.totalTrips / Number(limit)),
        },
      },
      "Trips fetched successfully",
      CODES.OK,
    );
  } catch (error) {
    console.error("Error fetching trips:", error);
    return sendError(
      res,
      {},
      "Failed to fetch trips",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

tripController.requestPickup = async (req, res) => {
  try {
    const { tripId } = req.params;

    if (!tripId || !mongoose.Types.ObjectId.isValid(String(tripId))) {
      return sendError(res, {}, "Valid tripId is required.", CODES.BAD_REQUEST);
    }

    const trip = await tripTable.findById(tripId);
    if (!trip) return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);

    if (trip.isDriverFound && trip.driverId) {
      return sendError(
        res,
        {},
        "Driver already assigned to this trip.",
        CODES.BAD_REQUEST,
      );
    }

    trip.lastSearchAt = new Date();
    await trip.save();

    const user = await User.findById(trip.customerId);

    const nearByDrivers = await User.find({
      role: "driver",
      driverStatus: constants.DRIVER_FINDING_TRIPS,
      isVerified: true,
    }).select("_id firebaseToken driverStatus");

    await tripTable.findByIdAndUpdate(trip._id, {
      nearByTempDrivers: nearByDrivers.map((d) => d._id),
      isReturnDriverFound: nearByDrivers.length ? "yes" : "no",
    });

    if (nearByDrivers.length === 0) {
      return sendSuccess(
        res,
        trip,
        "No drivers are free at the moment. Please try again after some time.",
        CODES.OK,
      );
    }

    if (nearByDrivers.length > 0) {
      await notifyNearbyDrivers({
        drivers: nearByDrivers,
        trip: trip,
        customerName: user.name,
      });
    }

    return sendSuccess(
      res,
      trip,
      `Request sent to ${nearByDrivers.length} driver(s). Please wait for acceptance.`,
      CODES.OK,
    );
  } catch (err) {
    console.error("requestPickup Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

tripController.requestDropoff = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { address, coordinates, additionalNotes } = req.body || {};

    if (!tripId || !mongoose.Types.ObjectId.isValid(String(tripId))) {
      return sendError(res, {}, "Valid tripId is required.", CODES.BAD_REQUEST);
    }

    const trip = await tripTable.findById(tripId);
    if (!trip) {
      return sendError(res, {}, "Trip not found.", CODES.NOT_FOUND);
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
    // if (trip.lastSearchAt && Date.now() - trip.lastSearchAt.getTime() < 60000) {
    //   return sendError(
    //     res,
    //     {},
    //     "Please wait before retrying dropoff driver search.",
    //     CODES.BAD_REQUEST,
    //   );
    // }

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
    const updatedTrip = await tripTable.findByIdAndUpdate(
      tripId,
      { $set: updateFields },
      { new: true },
    );

    // -------------------------------
    // Find Nearby Drivers
    // -------------------------------
    const user = await User.findById(trip.customerId);

    const nearByDrivers = await User.find({
      role: "driver",
      driverStatus: constants.DRIVER_FINDING_TRIPS,
      isVerified: true,
    }).select("_id firebaseToken driverStatus");

    const driverIds = nearByDrivers.map((d) => d._id);

    await tripTable.findByIdAndUpdate(tripId, {
      $set: {
        nearByTempDrivers: driverIds,
        isReturnDriverFound: driverIds.length ? "yes" : "no",
      },
    });

    if (nearByDrivers.length === 0) {
      return sendSuccess(
        res,
        trip,
        "No drivers are free at the moment. Please try again after some time.",
        CODES.OK,
      );
    }

    if (nearByDrivers.length > 0) {
      await notifyNearbyDrivers({
        drivers: nearByDrivers,
        trip: updatedTrip,
        customerName: user?.name || "Customer",
      });
    }

    return sendSuccess(
      res,
      updatedTrip,
      `Request sent to ${nearByDrivers.length} driver(s). Please wait for acceptance.`,
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

export default tripController;
