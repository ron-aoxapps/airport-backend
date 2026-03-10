import express from "express";
import tripController from "../../controllers/customer/trips/index.js";

const router = express.Router();

router.post("/add", tripController.createTrip);
router.post("/cancel-no-driver", tripController.cancelTripNoDriver);
router.post("/price", tripController.getTripPrice);
router.get("/:id", tripController.getTripById);
router.post("/verify-pickup-otp", tripController.verifyTripOTPForPickUp);
router.post("/review/:id", tripController.createDropoffDriverReviewByCustomer);
router.post(
  "/review/pickup/:id",
  tripController.createDropoffDriverReviewByCustomer,
);
router.post("/request-pickup/:tripId", tripController.requestPickup);
router.post("/request-dropoff/:tripId", tripController.requestDropoff);

router.get("/completed/all", tripController.getCompletedTripsByCustomer);
router.get("/active/all", tripController.getActiveReservationsByCustomer);
router.get("/parked/all", tripController.getParkedVehiclesOfCustomer);
router.post("/otp/resend", tripController.regenerateTripOTP);
router.put("/pickup/location", tripController.updatePickupLocation);
router.get("/transactions/all", tripController.getTripTransactionsByCustomer);

export default router;
