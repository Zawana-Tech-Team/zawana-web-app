import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/",
  auth,
  asyncRoute(async (_req: any, res: { json: (arg0: { coach: string; name: string; id: string; phone: string; status: string; paymentStatus: string; package: string; expiryDate: string; className: string; attendance: number; }[]) => void; }) => {
    res.json(
      await prisma.student.findMany({
        orderBy: { name: "asc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "badminton_fo", "coach"),
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { name: string; id: string; phone: string; className: string; coach: string; package: string; paymentStatus: string; attendance: number; expiryDate: string; status: string; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.student.create({
        data: req.body,
      })
    );
  })
);


router.patch("/:id", auth, roles("admin", "badminton_fo", "gym_fo", "clinic_fo"), asyncRoute(async (req, res) => {
  res.json(await prisma.student.update({ where: { id: String(req.params.id) }, data: req.body }));
}));
router.delete("/:id", auth, roles("admin"), asyncRoute(async (req, res) => {
  await prisma.student.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

export default router;
