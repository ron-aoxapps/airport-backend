import express from "express";
import bookingController from "../../controllers/admin/bookings/index.js";

const router = express.Router();

router.get("/", bookingController.listBookings);
router.get("/:id", bookingController.getBookingById);

export default router;
