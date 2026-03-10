import express from "express";
import carsRoutes from "./cars.js";
import parkingRoutes from "./parking.js";
import tripRoutes from "./trips.js";
import promoRoutes from "./promocodes.js";
import bookingRoutes from "./bookings.js";

const router = express.Router();

router.use("/cars", carsRoutes);
router.use("/parking", parkingRoutes);
router.use("/trip", tripRoutes);
router.use("/promo", promoRoutes);
router.use("/bookings", bookingRoutes);

export default router;
