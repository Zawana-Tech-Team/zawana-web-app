import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../utils/helpers.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (_req: any, res: { json: (arg0: { status: string; id: string; description: string; title: string; image: string; googleFormLink: string; publishDate: string; }[]) => void; }) => {
    res.json(
      await prisma.contentItem.findMany({
        orderBy: { publishDate: "desc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin"),
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { id: string; title: string; image: string; description: string; googleFormLink: string; status: string; publishDate: string; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.contentItem.create({
        data: req.body,
      })
    );
  })
);

router.patch(
  "/:id",
  auth,
  roles("admin"),
  asyncRoute(async (req, res) => {
    res.json(
      await prisma.contentItem.update({
        where: { id: String(req.params.id) },
        data: req.body,
      })
    );
  })
);

router.patch(
  "/:id/publish",
  auth,
  roles("admin"),
  asyncRoute(async (req: { params: { id: any; }; }, res: { json: (arg0: { id: string; title: string; image: string; description: string; googleFormLink: string; status: string; publishDate: string; }) => void; }) => {
    res.json(
      await prisma.contentItem.update({
        where: { id: req.params.id },
        data: {
          status: "published",
          publishDate: today(),
        },
      })
    );
  })
);


router.delete("/:id", auth, roles("admin"), asyncRoute(async (req, res) => {
  await prisma.contentItem.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

export default router;
