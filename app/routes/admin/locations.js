import express from "express";
import parkingController from "../../controllers/admin/locations/index.js";

const router = express.Router();

router.get("/", parkingController.getAllParkingLocations);
router.get("/sync/all", parkingController.syncParkingLocations);
router.post("/", parkingController.addParkingLocation);
router.delete("/:locationId", parkingController.deleteParkingLocation);
router.put("/status/:locationId", parkingController.toggleParkingLocation);
router.put("/:locationId", parkingController.updateParkingLocationDetails);
router.get("/all", parkingController.getAllParkingLocationsWithoutPagination);

export default router;
