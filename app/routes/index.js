import express from "express";
import authRoutes from "./auth/index.js";
import adminRoutes from "./admin/index.js";
import { authenticateJWT } from "../middlewares/authenticate.js";
import { authorizeRole } from "../middlewares/roles.js";
import commonRoutes from "./comman/index.js";
import customerRoutes from "./customer/index.js";
import driverRoutes from "./driver/index.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", authenticateJWT, authorizeRole("admin"), adminRoutes);

router.use("/common", authenticateJWT, commonRoutes);
router.use("/customer", authenticateJWT, authorizeRole("user"), customerRoutes);
router.use("/driver", authenticateJWT, authorizeRole("driver"), driverRoutes);

export default router;
