import express from "express";
import { upload } from "../../middlewares/multer.js";
import commanController from "../../controllers/comman/index.js";

const router = express.Router();

router.put("/", upload.single("profilePicture"), commanController.updateUser);

router.get("/", commanController.getUser);

router.put("/password", commanController.updatePassword);

export default router;
