import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Badge, Page, Empty } from "../components/UI";
import { get, patch, post } from "../api";

export function Bookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => get<any[]>("/bookings").then(setBookings).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const cancel = async (booking: any) => {
    if (!window.confirm("Cancel this booking?")) return;
    if (booking.kind === "private_course") {
      await post(`/member/private-courses/${booking.id}/cancel`, {});
    } else {
      await patch(`/bookings/${booking.id}/status`, { status: "cancelled" });
    }
    load();
  };

  return (
    <Page title="Booking history" eyebrow="Badminton schedule">
      {loading ? <Card className="p-8">Loading bookings…</Card> : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Card key={booking.id} className="p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black">{booking.title}</h3>
                    <Badge good={booking.status === "confirmed" || booking.status === "CONFIRMED"}>
                      {String(booking.status).replaceAll("_", " ")}
                    </Badge>
                    {booking.kind === "private_course" ? (
                      <Badge>{booking.paymentStatus === "paid" ? "Paid" : booking.status === "AWAITING_PAYMENT" ? "Payment required" : "Coach confirmation"}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-zawana-500">
                    {booking.date} · {booking.time} · {booking.court?.name || booking.location}{booking.coach ? ` · ${booking.coach.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zawana-500">
                    {booking.code} · {Number(booking.price).toLocaleString()} MMK
                  </p>
                </div>
                <div className="flex gap-2">
                  {booking.status === "AWAITING_PAYMENT" ? (
                    <Button onClick={async () => {
                      try {
                        await post(`/member/private-courses/${booking.id}/pay`, {});
                        load();
                      } catch (error: any) {
                        window.dispatchEvent(new CustomEvent("zawana-toast", { detail: error.message }));
                      }
                    }}>Payment instructions</Button>
                  ) : null}
                  {["confirmed", "CONFIRMED", "pending", "PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"].includes(booking.status) ? (
                    <Button variant="danger" onClick={() => cancel(booking)}>Cancel</Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
          {!bookings.length ? (
            <Empty title="No bookings yet" body="Your badminton court rentals and private courses will show up here." action={<Link to="/book/court"><Button>Book a court</Button></Link>} />
          ) : null}
        </div>
      )}
    </Page>
  );
}
