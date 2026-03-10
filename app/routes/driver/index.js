import express from "express";
import driverController from "../../controllers/driver/index.js";
const router = express.Router();

router.post("/go-online", driverController.toggleOnlineStatus);

// ================Car Pickup flow===================
router.post("/trip/accept/:id", driverController.acceptTrip);
router.post("/trip/reject/:id", driverController.rejectTrip);

router.post("/trip/pickup-in-route/:id", driverController.pickUpInRoute);
router.post(
  "/trip/arrived-at-customer-location/:id",
  driverController.driverArrivedAtCustomerLocation,
);
router.post("/trip/car-parked/:id", driverController.carParked);

// ================Car Return flow===================

router.post("/trip/return-accept/:id", driverController.acceptReturnTrip);
router.post("/trip/return-reject/:id", driverController.rejectReturnTrip);

router.post("/trip/return-in-route/:id", driverController.returnInRoute);
router.post("/trip/return-arrived/:id", driverController.returnArrived);
router.post("/trip/complete/:id", driverController.completeTrip);

// ================Add Review flow===================
router.post("/trip/review/:id", driverController.createCustomerReviewByDriver);

// ================OTP resend===================
router.post("/trip/resend-trip-otp/:id", driverController.sendReturnOTP);

// ================Trips Listing===================
router.get("/trips/return/completed", driverController.getCompletedReturnTrips);
router.get("/trips/pickup/completed", driverController.getCompletedPickups);
router.get("/trips/available", driverController.getAllAvailableTrips);
router.get("/trips/pending", driverController.getAllPendingRequests);

router.get("/profile", driverController.getDriverProfile);

router.get("/trip/:id", driverController.getTripById);

export default router;
