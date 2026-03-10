import { Router } from "express";
import promoController from "../../controllers/admin/promoCodes/index.js";

const router = Router();

router.post("/", promoController.createPromoCode);
router.get("/", promoController.getAllPromoCodes);
router.put("/:promoId", promoController.updatePromoCode);
router.delete("/:promoId", promoController.deletePromoCode);
router.put("/:promoId/toggle-visibility", promoController.toggleVisibility);

export default router;
