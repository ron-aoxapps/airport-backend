import express from "express";
import customerRoutes from "./customerRoutes.js";
import driverRoutes from "./driverRoutes.js";
import locationRoutes from "./locations.js";
import spaceRoutes from "./spaces.js";
import extrasRoutes from "./extrasRoutes.js";
import bookingSettingsRoutes from "./bookingSettingsRoutes.js";
import promoCodeRoutes from "./promoRoutes.js";
import bookingRoutes from "./bookingRoutes.js";
import tripRoutes from "./tripRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";

const router = express.Router();

router.use("/customer", customerRoutes);
router.use("/driver", driverRoutes);
router.use("/parking/locations", locationRoutes);
router.use("/parking/spaces", spaceRoutes);
router.use("/parking/extras", extrasRoutes);
router.use("/bookings", bookingRoutes);
router.use("/booking/settings", bookingSettingsRoutes);
router.use("/promos", promoCodeRoutes);
router.use("/trips", tripRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
