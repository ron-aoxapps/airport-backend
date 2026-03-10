import express from "express";
import parkingController from "../../controllers/customer/parking/index.js";

const router = express.Router();

router.get("/locations", parkingController.getAllParkingLocations);
router.get("/spaces", parkingController.getAllParkingSpaces);
router.get("/extras", parkingController.getExtraServices);

export default router;
