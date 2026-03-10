import express from "express";
import carController from "../../controllers/customer/cars/index.js";
import { upload } from "../../middlewares/multer.js";

const router = express.Router();

router.get("/", carController.getAllCars);
router.post("/", upload.single("carImage"), carController.addCar);
router.delete("/:carId", carController.deleteCar);

export default router;
