import express from "express";
import bookingSettingsController from "../../controllers/admin/bookingSettings/index.js";

const router = express.Router();

router.get("/", bookingSettingsController.getBookingSettings);
router.post("/", bookingSettingsController.upsertBookingSettings);

export default router;