ALTER TABLE "Booking" ADD COLUMN "coachAcceptedAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "paymentExpiresAt" DATETIME;

UPDATE "Booking"
SET "coachAcceptedAt" = COALESCE("coachAcceptedAt", "createdAt"),
    "paymentExpiresAt" = COALESCE("paymentExpiresAt", "reservationExpiresAt", datetime("createdAt", '+24 hours'))
WHERE "kind" = 'private_course' AND "status" = 'AWAITING_PAYMENT';

CREATE INDEX "Booking_privateCourse_paymentExpiresAt_idx"
ON "Booking"("kind", "status", "paymentExpiresAt");
