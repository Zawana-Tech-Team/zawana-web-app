import { Router } from "express";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/health",
  asyncRoute(
    async (
      _req: any,
      res: { json: (arg0: { ok: boolean; service: string; time: string; }) => void; }
    ) => {
      res.json({
        ok: true,
        service: "zawana-api",
        time: new Date().toISOString(),
      });
    }
  )
);

export default router;
