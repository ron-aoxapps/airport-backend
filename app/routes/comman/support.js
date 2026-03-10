import express from "express";
import supportController from "../../controllers/staff/support.js";
const router = express.Router();

router.post("/", supportController.createSupportMsg);
router.get("/", supportController.getAllMsgs);

export default router;
