import express from "express";
import authController from "../../controllers/auth/index.js";
import { upload } from "../../middlewares/multer.js";
import { authenticateJWT } from "../../middlewares/authenticate.js";

const router = express.Router();

router.post(
  "/signup",
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "drivingLicense", maxCount: 1 },
  ]),
  authController.signup,
);
router.post("/login", authController.login);
router.post("/check-user", authController.checkUser);
router.post("/admin/login", authController.adminLogin);

router.post("/verify-otp", authController.verifyLoginOTP);
router.post("/resend-otp", authController.resendOTP);
router.post("/verify-token", authController.verifyToken);

// Forgot password flow
router.post("/forgot-password", authController.forgotPassword);
router.post("/forgot-password/verify", authController.verifyForgotOTP);
router.post("/forgot-password/reset", authController.resetPassword);

router.post("/logout", authenticateJWT, authController.logout);

router.get("/resetpassword/verify/:token", authController.verifyResetToken);
router.post("/resetpassword", authController.setPassword);

router.post(
  "/link",
  authenticateJWT,
  authController.sendActivationLinkByUserId,
);

export default router;
