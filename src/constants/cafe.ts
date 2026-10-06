export const CAFE_LOCATIONS = [
  "Office",
  "1st Floor",
  "2nd Floor — Badminton Court",
  "3rd Floor — Badminton Court",
  "Cafe",
  "6th Floor",
] as const;

export const CAFE_PAYMENT_METHODS = ["CASH", "ONLINE"] as const;
export const CAFE_ORDER_STATUSES = ["NEW", "PREPARING", "READY", "DELIVERING", "COMPLETED", "CANCELLED"] as const;

export type CafeLocation = typeof CAFE_LOCATIONS[number];
export type CafePaymentMethod = typeof CAFE_PAYMENT_METHODS[number];
export type CafeOrderStatus = typeof CAFE_ORDER_STATUSES[number];
