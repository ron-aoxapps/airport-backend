import { Router } from "express";
import tripController from "../../controllers/admin/trips/index.js";

const router = Router();

router.get("/", tripController.getAllTrips);
router.post("/pickup/:tripId", tripController.requestPickup);
router.post("/dropoff/:tripId", tripController.requestDropoff);

export default router;
