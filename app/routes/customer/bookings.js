import express from "express";
import bookingController from "../../controllers/customer/bookings/index.js";

const router = express.Router();

router.get("/", bookingController.getAllBookings);

export default router;
