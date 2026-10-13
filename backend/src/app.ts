import express from "express";
import cors from "cors";
import { CLIENT_URLS } from "./config.js";

import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import courtRoutes from "./routes/courts.js";
import coachRoutes from "./routes/coaches.js";
import scheduleRoutes from "./routes/schedules.js";
import bookingRoutes from "./routes/bookings.js";
import dashboardRoutes from "./routes/dashboard.js";
import packageRoutes from "./routes/packages.js";
import membershipRoutes from "./routes/memberships.js";
import appointmentRoutes from "./routes/appointments.js";
import productRoutes from "./routes/products.js";
import cafeRoutes from "./routes/cafe.js";
import studentRoutes from "./routes/students.js";
import transactionRoutes from "./routes/transactions.js";
import contentRoutes from "./routes/content.js";
import notificationRoutes from "./routes/notifications.js";
import analyticsRoutes from "./routes/analytics.js";
import storeRoutes from "./routes/store.js";
import menuRoutes from "./routes/menu.js";

import { notFound, errorHandler,
} from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: CLIENT_URLS,
    credentials: true,
  })
);

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courts", courtRoutes);
app.use("/api/coaches", coachRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/memberships", membershipRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/products", productRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/cafe", cafeRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
