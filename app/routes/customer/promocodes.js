import { Router } from "express";
import promoController from "../../controllers/customer/promoCodes/index.js";

const router = Router();

router.get("/", promoController.getValidPromoCodesForCustomer);

export default router;
