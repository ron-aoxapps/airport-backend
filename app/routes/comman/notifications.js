import express from "express";
import notificationController from "../../controllers/comman/notifications/index.js";

const router = express.Router();

router.get("/", notificationController.getAllNotifications); 
router.get("/unread-count", notificationController.getUnreadNotificationCount); 
router.put("/read/:notificationId", notificationController.markNotificationAsRead);
router.put("/read-all", notificationController.markAllNotificationsAsRead);
router.post("/" , notificationController.createNotification);

export default router;