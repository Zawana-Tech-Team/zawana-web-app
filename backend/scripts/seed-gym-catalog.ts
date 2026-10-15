import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedGymCatalog } from "../src/services/gymPackages.js";

const db = new PrismaClient();
try {
  await seedGymCatalog(db);
  console.log("Gym catalog seeded. Existing package edits preserved; walk-in prices require Admin configuration.");
} finally { await db.$disconnect(); }
