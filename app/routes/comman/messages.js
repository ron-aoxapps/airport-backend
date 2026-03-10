import express from "express";
import messageController from "../../controllers/comman/messages/index.js";

const router = express.Router();

router.post("/",  messageController.createMessage);
router.get("/:chatId" , messageController.getMessages);
router.put("/:messageId" , messageController.readMessage);

export default router;