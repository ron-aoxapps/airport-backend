import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import Trips from "../models/Trips.js";
import * as constants from "../constants/index.js";

let ioInstance = null;

export function initSocket(server, allowedOrigins = "*") {
  ioInstance = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
  });

  // 🔐 Socket Auth Middleware (JWT)
  ioInstance.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Unauthorized: Token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(new Error("Unauthorized: User not found"));
      }

      if (user.token !== token) {
        return next(new Error("Forbidden: Token mismatch"));
      }

      socket.userId = user._id.toString();
      socket.role = user.role;

      next();
    } catch (err) {
      return next(new Error("Unauthorized: Invalid or expired token"));
    }
  });

  ioInstance.on("connection", (socket) => {
    const { userId, role } = socket;

    console.log(`🔌Socket connected: ${userId} (${role})`);

    socket.join(userId);

    // 🚗 Driver sends live location
    socket.on(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, async (data) => {
      const { lat, lng, tripId } = data;

      if (!lat || !lng) return;

      await User.findByIdAndUpdate(userId, {
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        lastLocationUpdatedAt: new Date(),
      });

      if (tripId) {
        const io = getIO();
        const trip = await Trips.findById(tripId);
        if (trip && trip.customerId) {
          io.to(trip.customerId.toString()).emit(
            SOCKET_EVENTS.DRIVER_LIVE_LOCATION,
            {
              driverId: userId,
              lat,
              lng,
            },
          );
        }
      }
    });

    // 🚗 Customer sends live location
    socket.on(SOCKET_EVENTS.CUSTOMER_LOCATION_UPDATE, async (data) => {
      const { lat, lng } = data;

      if (!lat || !lng) return;

      await User.findByIdAndUpdate(userId, {
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        lastLocationUpdatedAt: new Date(),
      });

      const user = await User.findById(userId).select("currentTripId");

      const tripId = user.currentTripId;

      if (tripId) {
        const io = getIO();
        const trip = await Trips.findById(tripId);
        if (trip && trip.driverId) {
          io.to(trip.driverId.toString()).emit(
            SOCKET_EVENTS.CUSTOMER_LIVE_LOCATION,
            {
              customerId: userId,
              lat,
              lng,
            },
          );
        }

        if (trip && trip.returnDriverId) {
          io.to(trip.returnDriverId.toString()).emit(
            SOCKET_EVENTS.CUSTOMER_LIVE_LOCATION,
            {
              customerId: userId,
              lat,
              lng,
            },
          );
        }
      }
    });

    socket.on("disconnect", async () => {
      console.log(`❌ Socket disconnected: ${userId}`);

      // if (role !== "driver") return;

      try {
        const driver = await User.findById(userId).select("currentTripId");

        const updatePayload = {
          driverStatus: constants.DRIVER_OFFLINE,
        };

        if (!driver?.currentTripId) {
          await User.findByIdAndUpdate(userId, updatePayload);
        }
      } catch (err) {
        console.error("Driver offline update failed:", err);
      }
    });
  });

  return ioInstance;
}

export function getIO() {
  if (!ioInstance) {
    throw new Error("❌ Socket.io not initialized yet.");
  }
  return ioInstance;
}
