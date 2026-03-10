import express from "express";
import extrasController from "../../controllers/admin/extras/index.js";

const router = express.Router();

router.post("/", extrasController.createExtra);
router.get("/", extrasController.getAllExtras);
router.get("/:id", extrasController.getExtraById);
router.put("/status/:id", extrasController.toggleExtraStatus);
router.put("/:id", extrasController.updateExtra);
router.delete("/:id", extrasController.deleteExtra);
router.get("/all/listing", extrasController.getAllExtraWithoutPagination);

export default router;
