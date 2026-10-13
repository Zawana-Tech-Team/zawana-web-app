import type { NextFunction, Request, Response,
} from "express";

export function notFound(_req: Request, res: Response) {
  return res.status(404).json({
    message: "Route not found",
  });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);

  if (err?.name === "ZodError") {
    return res.status(400).json({
      message: "Validation error",
      issues: err.issues,
    });
  }

  if (err?.code === "P2002") {
    return res.status(409).json({
      message: "A record with that unique value already exists",
    });
  }

  if (err?.code === "P2025") {
    return res.status(404).json({
      message: "Record not found",
    });
  }

  return res.status(500).json({
    message: "Internal server error",
  });
}
