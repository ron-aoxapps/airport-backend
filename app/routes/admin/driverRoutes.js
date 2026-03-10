import express from "express";
import driverController from "../../controllers/admin/drivers/index.js";
import { upload } from "../../middlewares/multer.js";

const router = express.Router();

router.get("/", driverController.getAlldriver);
router.get("/all", driverController.getAlldriverWithoutPagination);
router.put("/status/:id", driverController.toggledriverStatus);
router.put("/account-verify/:id", driverController.verifyDriver);
router.put(
  "/:id",
  upload.single("profilePicture"),
  driverController.updatedriver,
);
router.post("/", upload.single("profilePicture"), driverController.adddriver);
router.get("/:id", driverController.getdriverById);
router.get("/online/all", driverController.getAllOnlinedriver);
router.get("/available/all", driverController.getAvailableDrivers);

export default router;
