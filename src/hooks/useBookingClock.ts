import { useEffect, useState } from "react";
import { bookingClock } from "../utils/bookingTime";

export function useBookingClock() {
  const [now, setNow] = useState(bookingClock);
  useEffect(() => {
    const update = () => setNow(bookingClock());
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return now;
}
