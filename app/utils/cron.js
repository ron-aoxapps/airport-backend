import dotenv from "dotenv";
import cron from "node-cron";
import mongoose from "mongoose";
import { fetchAndIngest } from "../helpers/booking.js";
import { fetchAndIngestParkingSpaces } from "../helpers/parkingSpace.js";
import { fetchAndIngestLocations } from "../helpers/parkingLocations.js";

dotenv.config();

/**
 * Bootstrapping
 */
async function init() {
  try {
    await fetchAndIngest();
    const locationMap = await fetchAndIngestLocations();
    await fetchAndIngestParkingSpaces(locationMap);
  } catch (e) {
    console.error("[Cron] initial run failed:", e?.message);
  }

  // Schedule bookings fetch every 5 minutes
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await fetchAndIngest();
      } catch (e) {
        console.error("[BookingsCron] scheduled run failed:", e?.message);
      }
    },
    { timezone: "Asia/Kolkata" },
  );

  // Schedule parking spaces fetch every 5 minutes
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        const locationMap = await fetchAndIngestLocations();
        await fetchAndIngestParkingSpaces(locationMap);
      } catch (e) {
        console.error("[ParkingSpacesCron] scheduled run failed:", e?.message);
      }
    },
    { timezone: "Asia/Kolkata" },
  );

  console.log("[BookingsCron] Scheduled every 5 minutes (Asia/Kolkata)");
  console.log("[ParkingSpacesCron] Scheduled every 5 minutes (Asia/Kolkata)");
}

init().catch((e) => {
  console.error("[BookingsCron] fatal init error:", e?.message);
  process.exit(1);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing Mongo...");
  await mongoose.connection.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing Mongo...");
  await mongoose.connection.close();
  process.exit(0);
});
