import { useEffect, useState } from "react";
import { bookingClock } from "../utils/bookingTime";

export function useBookingClock() {
  const [now, setNow] = useState(bookingClock);
  useEffect(() => {
    const update = () => {
      const next = bookingClock();
      // Slot availability changes by the minute, not on every timer tick.
      setNow((previous) =>
        previous.date === next.date && previous.minute === next.minute
          ? previous
          : next,
      );
    };
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return now;
}
