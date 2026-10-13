import { Router } from "express";
import { z } from "zod";
import { auth, roles } from "../middleware/auth.js";
import { storeImage } from "../services/mediaStorage.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.post(
  "/images",
  auth,
  roles("admin", "store_fo", "cafe_fo"),
  asyncRoute(async (req, res) => {
    const { image } = z
      .object({
        image: z
          .string()
          .min(1)
          .max(8 * 1024 * 1024)
      })
      .parse(req.body);
    res.status(201).json({ url: await storeImage(image) });
  })
);

export default router;
