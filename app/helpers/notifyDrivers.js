import { getIO } from "../socket/index.js";
import { SOCKET_EVENTS } from "../constants/socketEvents.js";
import { sendFirebaseNotification } from "../firebase/client.js";
import { TRIP_FINDING } from "../constants/index.js";

export const notifyNearbyDrivers = async ({ drivers, trip, customerName }) => {
  const io = getIO();

  console.log(
    `🚨 Notifying ${drivers.length} nearby drivers about new trip ${trip._id}`,
    drivers,
  );

  for (const driver of drivers) {
    const tripObj = trip.toObject();

    tripObj.tripStatus = TRIP_FINDING;

    io.to(driver._id.toString()).emit(SOCKET_EVENTS.TRIP_CREATED, {
      tripId: trip._id,
      customerName,
      tripStatus: TRIP_FINDING,
      trip: tripObj,
    });

    /* ---------------- FIREBASE PUSH (BACKGROUND) ---------------- */
    if (driver.firebaseToken) {
      try {
        await sendFirebaseNotification({
          token: driver.firebaseToken,
          title: "🚕 New Trip Request",
          body: `Trip request from ${customerName}`,
          data: {
            tripId: trip._id.toString(),
            type: "NEW_TRIP_REQUEST",
          },
          androidChannelId: "trip_requests",
        });
      } catch (err) {
        console.error(
          `❌ Failed to send NEW_TRIP_REQUEST push to driver ${driver._id}:`,
          err.message,
        );
      }
    }
  }
};
