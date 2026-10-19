import { z } from "zod";
import { isDateKey } from "../utils/dateKeys.js";

function isHttpUrl(value: string) {
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export const contentInput = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(180),
  kind: z.enum(["community", "achievement"]).default("community"),
  category: z.enum(["Milestones", "Tournaments", "Academy", "Community"]).default("Milestones"),
  description: z.string().trim().max(3000).default(""),
  body: z.string().trim().max(100000).default(""),
  image: z.string().trim().max(2048).refine(
    value => !value || /^\/(?!\/)[\w/.-]+$/.test(value) || isHttpUrl(value),
    "Use an uploaded image, local image path, or HTTP(S) URL."
  ).default(""),
  googleFormLink: z.string().trim().max(2048).refine(
    value => !value || isHttpUrl(value), "Use an HTTP(S) link."
  ).default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  publishDate: z.string().refine(isDateKey, "Choose a valid publication date.")
}).superRefine((value, context) => {
  if (value.kind !== "achievement" || value.status !== "published") return;
  for (const field of ["description", "body"] as const) {
    if (!value[field]) context.addIssue({ code: "custom", path: [field], message: "Add a summary and article before publishing an achievement." });
  }
});
