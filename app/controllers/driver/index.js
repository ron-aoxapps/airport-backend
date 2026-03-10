import { sendSuccess, sendError } from "../../utils/responseHandler.js";
import { CODES } from "../../utils/statusCodes.js";
import User from "../../models/User.js";
import { sendFirebaseNotification } from "../../firebase/client.js";
import Trip from "../../models/Trips.js";
import Review from "../../models/Review.js";
import { updateUserRatingSummary } from "../../helpers/rating.js";
import {
  TRIP_CANCELLED,
  TRIP_COMPLETED,
  TRIP_PICKUP_INROUTE,
  TRIP_ARRIVED,
  TRIP_PARKING_INROUTE,
  TRIP_ACCEPTED,
  TRIP_PARKED,
  DRIVER_FINDING_TRIPS,
  DRIVER_OFFLINE,
  DRIVER_ON_PICKUP,
  DRIVER_DESTINATION_INROUTE,
  TRIP_RETURN_INROUTE,
  TRIP_RETURN_ARRIVED,
  TRIP_FINDING,
  TRIP_STATUS_GROUPS,
} from "../../constants/index.js";
import { SOCKET_EVENTS } from "../../constants/socketEvents.js";
import mongoose from "mongoose";
import { createAndEmitNotification } from "../../utils/sendNotification.js";

const driverController = {};

driverController.toggleOnlineStatus = async (req, res) => {
  try {
    const driverId = req.userId;
    const { status } = req.body;

    const driver = await User.findById(driverId);

    if (!driver)
      return sendError(res, {}, "Driver not found.", CODES.NOT_FOUND);

    if (status === DRIVER_FINDING_TRIPS) {
      driver.isOnline = true;
      driver.driverStatus = status;
    } else {
      driver.isOnline = false;
      driver.driverStatus = DRIVER_OFFLINE;
      driver.lastOnlineAt = new Date();
    }

    await driver.save();

    return sendSuccess(
      res,
      driver,
      `Driver is now ${driver.isOnline ? "online" : "offline"}.`,
      CODES.OK,
    );
  } catch (err) {
    console.error("Toggle Online Status Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.acceptTrip = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;
    const { clearNearby = true } = req.body || {};
    const io = req.app.get("io");

    if (!tripId)
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED];

    const IN_PROGRESS = [
      TRIP_PICKUP_INROUTE,
      TRIP_ARRIVED,
      TRIP_PARKING_INROUTE,
    ];

    const snapshot = await Trip.findById(tripId)
      .select(
        "_id customerId driverId isTripAccepted tripStatus parked nearByTempDrivers",
      )
      .lean();

    if (!snapshot)
      return sendError(res, {}, "Invalid trip ID.", CODES.BAD_REQUEST);

    if (
      BLOCKED.includes(snapshot.tripStatus) ||
      IN_PROGRESS.includes(snapshot.tripStatus)
    ) {
      return sendError(
        res,
        {},
        "Trip is already allotted or in progress.",
        CODES.BAD_REQUEST,
      );
    }

    if (
      snapshot.isTripAccepted === true &&
      snapshot.driverId &&
      String(snapshot.driverId) !== String(driverId)
    ) {
      return sendError(
        res,
        {},
        "Trip already accepted by another driver.",
        CODES.BAD_REQUEST,
      );
    }

    // Prepare atomic claim
    const now = new Date();
    const claimFilter = {
      _id: snapshot._id,
      tripStatus: { $nin: BLOCKED },
      $or: [{ driverId: { $exists: false } }, { driverId: null }, { driverId }],
    };

    const setFields = {
      driverId,
      isTripAccepted: true,
      acceptedAt: now,
      isDriverFound: true,
      driverFoundAt: now,
      tripStatus: TRIP_ACCEPTED,
    };

    const updated = await Trip.findOneAndUpdate(
      claimFilter,
      { $set: setFields },
      { new: true },
    )
      .populate([
        {
          path: "customerId",
          model: "User",
          select: "_id name email phone firebaseToken",
        },
        { path: "driverId", model: "User", select: "_id name email phone" },
      ])
      .lean();

    if (!updated)
      return sendError(
        res,
        {},
        "Trip already accepted or unavailable.",
        CODES.BAD_REQUEST,
      );

    /* ---------------- SOCKET EMIT ---------------- */
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(
          SOCKET_EVENTS.TRIP_ACCEPTED,
          {
            tripId: String(updated._id),
            tripStatus: updated.tripStatus,
            message: "Your trip has been accepted by a driver",
          },
        );
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    /* ---------------- PUSH NOTIFICATION ---------------- */
    try {
      const token = updated?.customerId?.firebaseToken;

      if (token) {
        const title = "Trip Accepted";
        const body = `Driver ${updated?.driverId?.name} has confirmed your booking. You will be notified when the driver starts pickup.`;

        const data = {
          kind: "TRIP_ACCEPTED",
          tripId: String(updated._id),
          status: TRIP_ACCEPTED,
        };

        await sendFirebaseNotification(title, body, token, data);
      }
    } catch (notifyErr) {
      console.error("FCM Notification Error:", notifyErr.message);
    }

    return sendSuccess(res, updated, "Trip accepted successfully.", CODES.OK);
  } catch (err) {
    console.error("Accept Trip Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.rejectTrip = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;

    if (!tripId)
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);

    const trip = await Trip.findById(tripId).select(
      "_id tripStatus isTripAccepted rejectedBy driverId",
    );

    if (!trip) return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);

    const TRIP_BLOCKED_STATES = [TRIP_CANCELLED, TRIP_COMPLETED];

    if (TRIP_BLOCKED_STATES.includes(trip.tripStatus)) {
      return sendError(
        res,
        {},
        "Trip is already completed or cancelled.",
        CODES.BAD_REQUEST,
      );
    }

    // if (trip.rejectedBy?.includes(driverId)) {
    //   return sendError(
    //     res,
    //     {},
    //     "You have already rejected this trip.",
    //     CODES.BAD_REQUEST,
    //   );
    // }

    const updated = await Trip.findByIdAndUpdate(
      tripId,
      {
        $addToSet: { rejectedBy: driverId },
        $set: {
          ...(String(trip.driverId) === String(driverId)
            ? { isTripAccepted: false }
            : {}),
        },
      },
      { new: true },
    ).select("_id tripStatus rejectedBy driverId");

    return sendSuccess(res, updated, "Trip rejected successfully.", CODES.OK);
  } catch (err) {
    console.error("Reject Trip Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.pickUpInRoute = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;
    const io = req.app.get("io");

    if (!tripId)
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);

    const trip = await Trip.findById(tripId)
      .populate([
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
      ])
      .lean();

    if (!trip) return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);

    if (String(trip.driverId?._id) !== String(driverId))
      return sendError(
        res,
        {},
        "Not authorized to update this trip.",
        CODES.FORBIDDEN,
      );

    const TRIP_BLOCKED_STATES = [TRIP_CANCELLED, TRIP_COMPLETED];

    if (TRIP_BLOCKED_STATES.includes(trip.tripStatus))
      return sendError(
        res,
        {},
        "Cannot update a completed or cancelled trip.",
        CODES.BAD_REQUEST,
      );

    if (trip.tripStatus === TRIP_PICKUP_INROUTE) {
      return sendError(res, {}, "trip is already started.", CODES.BAD_REQUEST);
    }

    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpires = new Date(Date.now() + 60 * 60 * 1000);

    // ✅ Update trip status
    const updated = await Trip.findByIdAndUpdate(
      tripId,
      {
        $set: {
          tripStatus: TRIP_PICKUP_INROUTE,
          tripOTP: newCode,
          tripOTPExpire: newExpires,
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

    await User.findByIdAndUpdate(driverId, {
      $set: { driverStatus: DRIVER_ON_PICKUP, currentTripId: tripId },
    });

    if (!updated)
      return sendError(
        res,
        {},
        "Failed to update trip status.",
        CODES.BAD_REQUEST,
      );

    // ✅ Emit socket event safely
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(SOCKET_EVENTS.TRIP_STARTED, {
          tripId: updated._id,
          tripStatus: updated.tripStatus,
          message: "Driver is on the way to pick your car.",
        });
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ✅ Push notification (isolated)
    try {
      const customer = updated?.customerId;
      const driver = updated?.driverId;

      if (
        customer?.firebaseToken &&
        customer.firebaseToken !== "" &&
        customer.firebaseToken !== "none"
      ) {
        const title = "Trip Started";
        const body = `Driver ${
          driver?.name || "your driver"
        } has started your trip. Sit back and relax — you’re on the way!`;

        const data = {
          kind: "TRIP_STARTED",
          tripId: String(updated._id),
          status: "Started",
        };

        await sendFirebaseNotification(
          title,
          body,
          customer.firebaseToken,
          data,
        );
      }
    } catch (notifyErr) {
      console.error("FCM Notification Error:", notifyErr.message);
    }

    // ================= ADMIN NOTIFICATION =================

    try {
      const adminNotification = {
        type: "TRIP",
        message: `Driver ${updated?.driverId?.name} is on the way to pick vehicle from customer ${updated.customerId?.name} `,
        meta: {
          userId: updated?.driverId?._id,
          link: "/trips",
          tripId,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error("Admin Trip Notification Error:", adminNotifyErr.message);
    }

    return sendSuccess(
      res,
      updated,
      "Trip marked as 'Pickup In Route' successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("PickupInRoute Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.driverArrivedAtCustomerLocation = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const snapshot = await Trip.findById(tripId)
      .select("_id tripStatus driverId")
      .lean();

    if (!snapshot) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    if (!snapshot.driverId || String(snapshot.driverId) !== String(driverId)) {
      return sendError(
        res,
        {},
        "Not authorized to update this trip.",
        CODES.FORBIDDEN,
      );
    }

    const TRIP_BLOCKED_STATES = [TRIP_CANCELLED, TRIP_COMPLETED, TRIP_PARKED];

    if (TRIP_BLOCKED_STATES.includes(snapshot.tripStatus)) {
      return sendError(
        res,
        {},
        `Cannot move trip from '${snapshot.tripStatus}' to 'PickupArrived'.`,
        CODES.BAD_REQUEST,
      );
    }

    if (snapshot.tripStatus === TRIP_ARRIVED) {
      return sendError(
        res,
        {},
        "Driver is already at the location.",
        CODES.BAD_REQUEST,
      );
    }

    const wantStatus = TRIP_ARRIVED;
    const needUpdate = snapshot.tripStatus !== wantStatus;

    const updated = await Trip.findOneAndUpdate(
      { _id: tripId, driverId },
      {
        $set: {
          tripStatus: wantStatus,
          driverArrivedAt: new Date(),
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

    // ✅ Emit socket safely
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(
          SOCKET_EVENTS.DRIVER_ARRIVED,
          {
            tripId: updated._id,
            tripStatus: updated.tripStatus,
            message: "Driver has arrived at pickup location.",
          },
        );
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ✅ Push notification (isolated)
    try {
      const customer = updated?.customerId;
      const driver = updated?.driverId;

      if (
        customer?.firebaseToken &&
        customer.firebaseToken !== "" &&
        customer.firebaseToken !== "none"
      ) {
        const title = "Driver Arrived";
        const body = `${
          driver?.name || "Your driver"
        } has arrived at your pickup location. Please verify OTP to begin.`;

        const data = {
          kind: "TRIP_ARRIVED",
          tripId: String(updated._id),
          status: "Arrived",
        };

        await sendFirebaseNotification(
          title,
          body,
          customer.firebaseToken,
          data,
        );
      }
    } catch (notifyErr) {
      console.error("FCM Notification Error:", notifyErr?.message || notifyErr);
    }

    return sendSuccess(
      res,
      updated,
      "Trip marked as 'PickupArrived' successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("driverArrivedAtCustomerLocation Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.carParked = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const snapshot = await Trip.findById(tripId)
      .select("_id tripStatus driverId parked")
      .lean();

    if (!snapshot) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    if (!snapshot.driverId || String(snapshot.driverId) !== String(driverId)) {
      return sendError(
        res,
        {},
        "Not authorized to update this trip.",
        CODES.FORBIDDEN,
      );
    }

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED, TRIP_PARKED];
    if (BLOCKED.includes(snapshot.tripStatus)) {
      return sendError(
        res,
        {},
        `Cannot move trip from '${snapshot.tripStatus}' to 'Parked'.`,
        CODES.BAD_REQUEST,
      );
    }

    const wantStatus = TRIP_PARKED;
    const needUpdate =
      snapshot.tripStatus !== wantStatus || snapshot.parked !== true;

    const updated = await Trip.findOneAndUpdate(
      { _id: tripId, driverId },
      needUpdate
        ? {
            $set: {
              tripStatus: wantStatus,
              carParkedAt: new Date(),
              parked: true,
            },
          }
        : {},
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

    await User.findByIdAndUpdate(driverId, {
      $set: { driverStatus: DRIVER_FINDING_TRIPS, currentTripId: null },
    });

    const io = req.app.get("io");

    // ✅ Emit socket event
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(SOCKET_EVENTS.CAR_PARKED, {
          tripId: updated._id,
          tripStatus: updated.tripStatus,
          message: "Your vehicle has been parked safely.",
        });
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ✅ Push notification
    try {
      const customer = updated?.customerId;

      if (
        customer?.firebaseToken &&
        customer.firebaseToken !== "" &&
        customer.firebaseToken !== "none"
      ) {
        const title = "Vehicle Parked";
        const body = "Your vehicle has been parked safely.";

        const data = {
          kind: "TRIP_PARKED",
          tripId: String(updated._id),
          status: "Parked",
        };

        await sendFirebaseNotification(
          title,
          body,
          customer.firebaseToken,
          data,
        );
      }
    } catch (notifyErr) {
      console.error("FCM Notification Error:", notifyErr?.message || notifyErr);
    }

    // ================= ADMIN NOTIFICATION =================

    try {
      const adminNotification = {
        type: "TRIP",
        message: `Driver ${updated?.driverId?.name} has parked the vehicle of ${updated?.customerId?.name} at parking space.`,
        meta: {
          userId: updated?.driverId?._id,
          link: "/trips",
          tripId,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error("Admin Trip Notification Error:", adminNotifyErr.message);
    }

    return sendSuccess(
      res,
      updated,
      "Trip marked as 'Parked' successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("carParked Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.acceptReturnTrip = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;
    const { clearNearby = true } = req.body || {};

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED];
    const IN_PROGRESS = [TRIP_RETURN_INROUTE, TRIP_RETURN_ARRIVED];

    const now = new Date();
    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpires = new Date(Date.now() + 60 * 60 * 1000);

    // ✅ Atomic claim (race condition safe)
    const updated = await Trip.findOneAndUpdate(
      {
        _id: tripId,
        tripStatus: { $nin: [...BLOCKED, ...IN_PROGRESS] },
        $or: [{ returnDriverId: null }, { returnDriverId: driverId }],
      },
      {
        $set: {
          returnDriverId: driverId,
          isReturnDriverFound: true,
          returnDriverFoundAt: now,
          tripStatus: TRIP_RETURN_INROUTE,
          tripOTP: newCode,
          tripOTPExpire: newExpires,
          ...(clearNearby && { nearByTempDrivers: [] }),
        },
      },
      { new: true },
    )
      .populate([
        {
          path: "customerId",
          model: "User",
          select: "_id name email phone firebaseToken",
        },
        {
          path: "returnDriverId",
          model: "User",
          select: "_id name email phone",
        },
      ])
      .lean();

    if (!updated) {
      return sendError(
        res,
        {},
        "Return trip already accepted or unavailable.",
        CODES.BAD_REQUEST,
      );
    }

    const io = req.app.get("io");

    // ✅ Update driver state
    await User.findByIdAndUpdate(driverId, {
      $set: {
        driverStatus: DRIVER_DESTINATION_INROUTE,
        currentTripId: tripId,
      },
    });

    // ================= SOCKET EMIT =================
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(
          SOCKET_EVENTS.pickUpInRoute,
          {
            tripId: updated._id,
            tripStatus: updated.tripStatus,
            message: "Driver is on the way to return your vehicle.",
          },
        );
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ================= PUSH NOTIFICATION =================
    try {
      const c = updated.customerId;
      const d = updated.returnDriverId;

      if (c?.firebaseToken && c.firebaseToken !== "none") {
        await sendFirebaseNotification(
          "Return In Route",
          `${d?.name || "Your driver"} is on the way to return your vehicle.`,
          c.firebaseToken,
          {
            kind: "RETURN_IN_ROUTE",
            tripId: String(updated._id),
            status: "ReturnInRoute",
          },
        );
      }
    } catch (notifyErr) {
      console.error("FCM send error:", notifyErr?.message);
    }

    // ================= ADMIN NOTIFICATION =================
    try {
      await createAndEmitNotification(io, {
        type: "TRIP",
        message: `Driver ${updated?.returnDriverId?.name} accepted return trip of ${updated.customerId?.name}.`,
        meta: {
          tripId: updated._id,
          link: "/trips",
          userId: updated?.returnDriverId?._id,
        },
      });
    } catch (adminErr) {
      console.error("Admin notification error:", adminErr.message);
    }

    return sendSuccess(
      res,
      updated,
      "Return trip accepted successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Accept Return Trip Error:", err);
    return sendError(
      res,
      {},
      err.message || "Internal Server Error",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.rejectReturnTrip = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;

    if (!tripId)
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);

    const trip = await Trip.findById(tripId)
      .select("_id tripStatus returnDriverId returnRejectedBy customerId")
      .populate("customerId");

    if (!trip) return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);

    if ([TRIP_COMPLETED, TRIP_CANCELLED].includes(trip.tripStatus)) {
      return sendError(
        res,
        {},
        "Return trip is already completed or cancelled.",
        CODES.BAD_REQUEST,
      );
    }

    if (trip.returnRejectedBy?.includes(driverId)) {
      return sendError(
        res,
        {},
        "You have already rejected this return trip.",
        CODES.BAD_REQUEST,
      );
    }

    const updated = await Trip.findByIdAndUpdate(
      tripId,
      {
        $addToSet: { returnRejectedBy: driverId },
        $set:
          String(trip.returnDriverId) === String(driverId)
            ? { isTripAccepted: false }
            : {},
      },
      { new: true },
    ).select("_id tripStatus returnDriverId returnRejectedBy");

    // ================= ADMIN NOTIFICATION =================

    const driver = await User.findById(driverId);
    const customer = await trip.customerId?.name;

    try {
      const io = req.app.get("io");

      const adminNotification = {
        type: "TRIP",
        message: `Return trip of customer ${customer} is rejected by driver ${driver?.name}`,
        meta: {
          userId: driverId,
          link: "/trips",
          tripid: updated?._id,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error(
        "Admin Return Reject Notification Error:",
        adminNotifyErr.message,
      );
    }

    return sendSuccess(
      res,
      updated,
      "Return trip rejected successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Reject Return Trip Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.returnInRoute = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const snapshot = await Trip.findById(tripId)
      .select("_id tripStatus returnDriverId parked")
      .lean();

    if (!snapshot) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    if (
      !snapshot.returnDriverId ||
      String(snapshot.returnDriverId) !== String(driverId)
    ) {
      return sendError(
        res,
        {},
        "Not authorized to update this trip.",
        CODES.FORBIDDEN,
      );
    }

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED];
    if (BLOCKED.includes(snapshot.tripStatus)) {
      return sendError(
        res,
        {},
        `Cannot move trip from '${snapshot.tripStatus}' to 'ReturnInRoute'.`,
        CODES.BAD_REQUEST,
      );
    }

    const wantStatus = TRIP_RETURN_INROUTE;
    const needUpdate = snapshot.tripStatus !== wantStatus;

    const updated = await Trip.findOneAndUpdate(
      { _id: tripId, returnDriverId: driverId },
      { $set: { tripStatus: wantStatus } },
      { new: true },
    ).populate([
      {
        path: "customerId",
        model: "User",
        select: "_id name email phone firebaseToken",
      },
      {
        path: "returnDriverId",
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

    await User.findByIdAndUpdate(driverId, {
      $set: { driverStatus: DRIVER_DESTINATION_INROUTE, currentTripId: tripId },
    });

    const io = req.app.get("io");

    // ✅ Emit socket safely
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(
          SOCKET_EVENTS.pickUpInRoute,
          {
            tripId: updated._id,
            tripStatus: updated.tripStatus,
            message: "Driver is on the way to return your vehicle.",
          },
        );
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ✅ Push notification (isolated)
    try {
      const c = updated?.customerId;
      const d = updated?.returnDriverId;

      if (
        c?.firebaseToken &&
        c.firebaseToken !== "" &&
        c.firebaseToken !== "none"
      ) {
        const title = "Return In Route";
        const body = `${
          d?.name || "Your driver"
        } is on the way to return your vehicle.`;

        const data = {
          kind: "RETURN_IN_ROUTE",
          tripId: String(updated._id),
          status: "ReturnInRoute",
        };

        await sendFirebaseNotification(title, body, c.firebaseToken, data);
      }
    } catch (notifyErr) {
      console.error(
        "FCM (customer) send error:",
        notifyErr?.message || notifyErr,
      );
    }

    return sendSuccess(
      res,
      updated,
      "Trip marked as 'ReturnInRoute'.",
      CODES.OK,
    );
  } catch (err) {
    console.error("returnInRoute Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.returnArrived = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const snapshot = await Trip.findById(tripId)
      .select("_id tripStatus returnDriverId returnArrivedAt")
      .lean();

    if (!snapshot) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    if (
      !snapshot.returnDriverId ||
      String(snapshot.returnDriverId) !== String(driverId)
    ) {
      return sendError(
        res,
        {},
        "Not authorized to update this trip.",
        CODES.FORBIDDEN,
      );
    }

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED];
    if (BLOCKED.includes(snapshot.tripStatus)) {
      return sendError(
        res,
        {},
        `Cannot mark return arrival when trip is '${snapshot.tripStatus}'.`,
        CODES.BAD_REQUEST,
      );
    }

    // const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    // const newExpires = new Date(Date.now() + 60 * 60 * 1000);

    const updated = await Trip.findOneAndUpdate(
      { _id: tripId, returnDriverId: driverId },
      {
        $set: {
          tripStatus: TRIP_RETURN_ARRIVED,
          // tripOTP: newCode,
          // tripOTPExpire: newExpires,
          returnArrivedAt: new Date(),
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
        path: "returnDriverId",
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

    // ✅ Emit socket safely
    try {
      if (io && updated?.customerId?._id) {
        io.to(String(updated.customerId._id)).emit(
          SOCKET_EVENTS.DRIVER_ARRIVED,
          {
            tripId: updated._id,
            tripStatus: updated.tripStatus,
            message: "Driver has arrived to return your vehicle.",
          },
        );
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ✅ Push notification (isolated + awaited)
    try {
      const c = updated?.customerId;
      const d = updated?.returnDriverId;

      if (
        c?.firebaseToken &&
        c.firebaseToken !== "" &&
        c.firebaseToken !== "none"
      ) {
        const title =
          typeof globalThis.__ === "function"
            ? globalThis.__("TRIP_ARRIVED_SUCCESS")
            : "Return Arrival";

        const body = `${
          d?.name || "Your driver"
        } has arrived to return your vehicle. Please verify OTP.`;

        const notificationData = {
          type: "trip",
          tripId: updated._id.toString(),
          tripStatus: TRIP_RETURN_ARRIVED,
        };

        await sendFirebaseNotification(
          title,
          body,
          c.firebaseToken,
          notificationData,
        );
      }
    } catch (notifyErr) {
      console.error(
        "FCM (customer) send error:",
        notifyErr?.message || notifyErr,
      );
    }

    return sendSuccess(
      res,
      updated,
      "Return arrival recorded successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("returnArrived Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.completeTrip = async (req, res) => {
  try {
    const driverId = req.userId;
    const tripId = req.params.id;
    const { otp } = req.body || {};

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }
    if (!otp) {
      return sendError(res, {}, "OTP is required.", CODES.BAD_REQUEST);
    }

    // Load trip with auth + OTP snapshot
    const trip = await Trip.findById(tripId).populate([
      {
        path: "customerId",
        model: "User",
        select: "_id name email phone firebaseToken",
      },
      {
        path: "returnDriverId",
        model: "User",
        select: "_id name email phone firebaseToken",
      },
    ]);

    if (!trip) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    if (
      !trip.returnDriverId ||
      String(trip.returnDriverId?._id) !== String(driverId)
    ) {
      return sendError(
        res,
        {},
        "Not authorized to update this trip.",
        CODES.FORBIDDEN,
      );
    }

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED];
    if (BLOCKED.includes(trip.tripStatus)) {
      return sendError(
        res,
        {},
        `Cannot complete a trip currently in '${trip.tripStatus}'.`,
        CODES.BAD_REQUEST,
      );
    }

    const code = String(trip.tripOTP || "");
    const exp = trip.tripOTPExpire ? new Date(trip.tripOTPExpire) : null;

    if (!code) {
      return sendError(res, {}, "No OTP set for this trip.", CODES.BAD_REQUEST);
    }
    if (String(otp) !== code) {
      return sendError(res, {}, "Invalid OTP.", CODES.BAD_REQUEST);
    }
    // if (exp && Date.now() > exp.getTime()) {
    //   return sendError(res, {}, "OTP has expired.", CODES.BAD_REQUEST);
    // }

    trip.tripStatus = TRIP_COMPLETED;
    trip.droppedOffAt = new Date();
    trip.verified = true;

    trip.tripOTP = null;
    trip.tripOTPExpire = null;

    await trip.save();

    await User.findByIdAndUpdate(driverId, {
      $set: { driverStatus: DRIVER_FINDING_TRIPS, currentTripId: null },
    });

    const io = req.app.get("io");

    // ✅ Emit socket
    try {
      if (io && trip?.customerId?._id) {
        io.to(String(trip.customerId._id)).emit(SOCKET_EVENTS.TRIP_COMPLETED, {
          tripId: trip._id,
          tripStatus: trip.tripStatus,
          message: "Your trip has been completed successfully.",
        });
      }
    } catch (socketErr) {
      console.error("Socket Emit Error:", socketErr.message);
    }

    // ✅ Push notification (isolated + awaited)
    try {
      const c = trip?.customerId;
      const d = trip?.returnDriverId;

      if (
        c?.firebaseToken &&
        c.firebaseToken !== "" &&
        c.firebaseToken !== "none"
      ) {
        const title = "Trip Completed";
        const body = `${
          d?.name || "Your driver"
        } has returned your vehicle. Thank you for choosing us.`;

        const data = {
          type: "trip",
          tripId: trip._id.toString(),
          tripStatus: "COMPLETED",
        };

        await sendFirebaseNotification(title, body, c.firebaseToken, data);
      }
    } catch (notifyErr) {
      console.error(
        "FCM (customer) send error:",
        notifyErr?.message || notifyErr,
      );
    }

    // ================= ADMIN NOTIFICATION =================

    try {
      const adminNotification = {
        type: "TRIP",
        message: `Vehicle of ${trip?.customerId?.name} is dropped off. Trip completed by driver ${trip?.returnDriverId?.name}`,
        meta: {
          userId: trip?.returnDriverId?._id,
          link: "/trips",
          tripId,
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (adminNotifyErr) {
      console.error(
        "Admin Trip Completion Notification Error:",
        adminNotifyErr.message,
      );
    }

    return sendSuccess(
      res,
      trip,
      "OTP verified. Trip completed successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("verifyReturnOTP Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.sendReturnOTP = async (req, res) => {
  try {
    const tripId = req.params.id;

    if (!tripId) {
      return sendError(res, {}, "Trip ID is required.", CODES.BAD_REQUEST);
    }

    const snapshot = await Trip.findById(tripId)
      .select("_id tripStatus driverId")
      .lean();

    if (!snapshot) {
      return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);
    }

    // if (!snapshot.driverId || String(snapshot.driverId) !== String(driverId)) {
    //   return sendError(
    //     res,
    //     "Not authorized to update this trip.",
    //     CODES.FORBIDDEN
    //   );
    // }

    const BLOCKED = [TRIP_CANCELLED, TRIP_COMPLETED];
    if (BLOCKED.includes(snapshot.tripStatus)) {
      return sendError(
        res,
        {},
        `Cannot send OTP when trip is '${snapshot.tripStatus}'.`,
        CODES.BAD_REQUEST,
      );
    }

    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpires = new Date(Date.now() + 10 * 60 * 1000);

    const updated = await Trip.findOneAndUpdate(
      { _id: tripId },
      { $set: { tripOTP: newCode, tripOTPExpire: newExpires } },
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

    // send otp via twilio notification

    return sendSuccess(
      res,
      {
        tripId: updated._id,
        otp: newCode,
        expiresAt: newExpires,
      },
      "OTP generated and sent to customer.",
      CODES.OK,
    );
  } catch (err) {
    console.error("sendReturnOTP Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.createCustomerReviewByDriver = async (req, res) => {
  try {
    const driverId = req.userId;
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
      .select("_id customerId driverId tripStatus")
      .lean();
    if (!trip) return sendError(res, {}, "Invalid Trip ID.", CODES.BAD_REQUEST);

    if (!trip.driverId || String(trip.driverId) !== String(driverId))
      return sendError(
        res,
        {},
        "Not authorized for this trip.",
        CODES.FORBIDDEN,
      );

    if (trip.tripStatus !== TRIP_COMPLETED)
      return sendError(
        res,
        {},
        "You can only review a completed trip.",
        CODES.BAD_REQUEST,
      );

    if (!trip.customerId)
      return sendError(
        res,
        {},
        "No customer associated with this trip.",
        CODES.BAD_REQUEST,
      );

    // one review per side
    const exists = await Review.findOne({ tripId, author: "driver" }).lean();
    if (exists)
      return sendError(
        res,
        {},
        "You already reviewed this trip.",
        CODES.CONFLICT,
      );

    const doc = await Review.create({
      tripId,
      driverId: trip.driverId,
      customerId: trip.customerId,
      author: "driver",
      rating: Number(rating),
      feedback: String(feedback).trim(),
    });

    // optional: refresh customer aggregates
    updateUserRatingSummary(trip.customerId).catch(() => {});

    return sendSuccess(res, doc, "Review submitted.", CODES.CREATED);
  } catch (err) {
    console.error("createCustomerReviewByDriver error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.getCompletedReturnTrips = async (req, res) => {
  try {
    const driverId = req.userId;
    const { page = 1, limit = 10 } = req.query;

    const filter = { returnDriverId: driverId, tripStatus: TRIP_COMPLETED };

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
            "rawSourceData.c_flightno": 1,
            "rawSourceData.c_airline": 1,
            "rawSourceData.c_flightno_date": 1,
            "rawSourceData.c_airline_date": 1,
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
      "Completed return trips fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getCompletedReturnTrips Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.getCompletedPickups = async (req, res) => {
  try {
    const driverId = req.userId;
    const { page = 1, limit = 10 } = req.query;

    const filter = { parked: true, driverId };

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
            "rawSourceData.c_flightno": 1,
            "rawSourceData.c_airline": 1,
            "rawSourceData.c_flightno_date": 1,
            "rawSourceData.c_airline_date": 1,
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
      "Completed pickups fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getCompletedPickups Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.getAllAvailableTrips = async (req, res) => {
  try {
    const driverId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    let filter = {};

    if (status) {
      if (status === TRIP_FINDING) {
        filter.tripStatus = TRIP_FINDING;
      } else if (status === TRIP_COMPLETED) {
        filter.tripStatus = {
          $in: [TRIP_COMPLETED, TRIP_PARKED],
        };

        filter.$or = [{ driverId: driverId }, { returnDriverId: driverId }];
      } else {
        filter.tripStatus = status;
        filter.$or = [{ driverId: driverId }, { returnDriverId: driverId }];
      }
    } else {
      // DEFAULT BEHAVIOR

      filter.$or = [
        // 1️⃣ All TRIP_FINDING (no driver restriction)
        // { tripStatus: TRIP_FINDING },

        // 2️⃣ Other ongoing trips only if assigned to this driver
        {
          tripStatus: {
            $in: TRIP_STATUS_GROUPS.ONGOING.filter((s) => s !== TRIP_FINDING),
          },
          $or: [{ driverId: driverId }, { returnDriverId: driverId }],
        },
      ];
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
            "rawSourceData.c_flightno": 1,
            "rawSourceData.c_airline": 1,
            "rawSourceData.c_flightno_date": 1,
            "rawSourceData.c_airline_date": 1,
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
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Trip.countDocuments(filter);

    return sendSuccess(
      res,
      {
        trips,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Driver trips fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getAllAvailableTrips Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.getAllPendingRequests = async (req, res) => {
  try {
    const driverId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const filter = {
      tripStatus: TRIP_FINDING,
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
            "rawSourceData.c_flightno": 1,
            "rawSourceData.c_airline": 1,
            "rawSourceData.c_flightno_date": 1,
            "rawSourceData.c_airline_date": 1,
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
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Trip.countDocuments(filter);

    return sendSuccess(
      res,
      {
        trips,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Driver ongoing trips fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getAllAvailableTrips Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.getDriverProfile = async (req, res) => {
  try {
    const driverId = req.userId;

    const driver = await User.findById(driverId).lean();

    if (!driver) {
      return sendError(res, {}, "Driver not found.", CODES.NOT_FOUND);
    }

    return sendSuccess(
      res,
      driver,
      "Driver profile fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("getDriverProfile Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

driverController.getTripById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return sendError(res, {}, "Invalid trip id.", CODES.BAD_REQUEST);
    }

    const trip = await Trip.findById(id)
      .select(
        "_id customerId driverId bookingId tripOTP parkingSpaceId tripStatus parked returnDriverId createdAt pickup dropoff additionalNotes",
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
            "rawSourceData.c_flightno": 1,
            "rawSourceData.c_airline": 1,
            "rawSourceData.c_flightno_date": 1,
            "rawSourceData.c_airline_date": 1,
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

    if (trip?.customerId?._id) {
      const ratingData = await Review.aggregate([
        {
          $match: {
            customerId: trip.customerId._id,
            author: "driver",
          },
        },
        {
          $group: {
            _id: "$customerId",
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]);

      if (ratingData.length > 0) {
        trip.customerId.rating = Number(ratingData[0].averageRating.toFixed(1));
        trip.customerId.totalReviews = ratingData[0].totalReviews;
      } else {
        trip.customerId.rating = 0;
        trip.customerId.totalReviews = 0;
      }
    }

    return sendSuccess(res, trip, "Trip fetched successfully.", CODES.OK);
  } catch (err) {
    console.error("Get Trip By Id Error:", err);
    return sendError(res, {}, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

export default driverController;
