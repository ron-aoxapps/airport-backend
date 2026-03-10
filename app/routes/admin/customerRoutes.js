import express from "express";
import customerController from "../../controllers/admin/customers/index.js";
import { upload } from "../../middlewares/multer.js";

const router = express.Router();

router.get("/", customerController.getAllCustomer);
router.get("/all", customerController.getAllCustomerWithoutPagination);
router.put("/status/:id", customerController.toggleCustomerStatus);
router.put(
  "/:id",
  upload.single("profilePicture"),
  customerController.updateCustomer,
);
router.post(
  "/",
  upload.single("profilePicture"),
  customerController.addCustomer,
);
router.get("/:id", customerController.getCustomerById);

export default router;
