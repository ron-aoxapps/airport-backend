import express from "express";
import settingRoutes from "./settings.js";
// import messageRoutes from "./messages.js";
import notificationRoutes from "./notifications.js";
// import supportRoutes from "./support.js";

const router = express.Router();

router.use("/settings", settingRoutes);
// router.use("/messages", messageRoutes);
router.use("/notifications", notificationRoutes);
// router.use("/support", supportRoutes);

export default router;
