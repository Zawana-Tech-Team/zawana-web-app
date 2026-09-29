import "dotenv/config";

export const PORT = Number(process.env.PORT || 8000);
export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
export const CLIENT_URLS =
  process.env.CLIENT_URL?.split(",").map((v) => v.trim()).filter(Boolean) ||
  ["http://localhost:5173"];
