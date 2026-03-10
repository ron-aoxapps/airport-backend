import express from "express";
import parkingSpacesController from "../../controllers/admin/parking-spaces/index.js";

const router = express.Router();

router.get("/", parkingSpacesController.getAllParkingSpaces);
// router.get("/sync/all", parkingSpacesController.syncParkingSpaces);
router.post("/", parkingSpacesController.createParkingSpace);
router.put("/:spaceId", parkingSpacesController.updateParkingSpace);
router.delete("/:spaceId", parkingSpacesController.deleteParkingSpace);
router.put(
  "/toggle/:spaceId",
  parkingSpacesController.toggleParkingSpaceStatus
);

export default router;
