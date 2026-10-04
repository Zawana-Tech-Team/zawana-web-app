import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card, Badge, Page, Empty } from "../components/UI";
import { get, patch, post } from "../api";

export function Bookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [cancelling,setCancelling]=useState("");
  const [paying,setPaying]=useState("");
  const [page,setPage]=useState(1),[pageInfo,setPageInfo]=useState({page:1,limit:20,total:0,totalPages:0});
  const load = async () => {try{const result=await get<any>(`/bookings?page=${page}&limit=20`);setBookings(result.data||[]);setPageInfo(result.pagination||pageInfo)}catch(e:any){setError(e.message||"Could not load bookings.")}finally{setLoading(false)}};
  useEffect(() => {setLoading(true);void load()}, [page]);

  const cancel = async (booking: any) => {
    if (!window.confirm("Cancel this booking?")) return;
    setCancelling(booking.id);setError("");setMessage("");
    try{if (booking.kind === "private_course") await post(`/member/private-courses/${booking.id}/cancel`, {});else await patch(`/bookings/${booking.id}/status`, { status: "cancelled" });await load();}
    catch(e:any){setError(e.message||"Could not cancel this booking.");}finally{setCancelling("");}
  };
  const confirmCourse = async (booking:any) => {
    setPaying(booking.id);setError("");setMessage("");
    try{const result=await post<any>(`/member/private-courses/${booking.id}/pay`,{});setMessage(result.message||"Private course confirmed. Payment will be arranged at the venue.");await load();}
    catch(e:any){setError(e.message||"Could not confirm this private course.");}finally{setPaying("");}
  };
  const statusLabel=(value:string)=>({PENDING_COACH_CONFIRMATION:"Waiting for coach",AWAITING_PAYMENT:"Payment required",COACH_DECLINED:"Coach declined",EXPIRED:"Expired",CONFIRMED:"Confirmed",COMPLETED:"Completed",CANCELLED:"Cancelled"} as Record<string,string>)[value]||String(value).replaceAll("_"," ");

  return (
    <Page title="Booking history" eyebrow="Badminton schedule">
      {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message&&<p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p>}
      {loading ? <Card className="p-8">Loading bookings…</Card> : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Card key={booking.id} className="p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black">{booking.title}</h3>
                    <Badge good={booking.status === "confirmed" || booking.status === "CONFIRMED" || booking.status === "COMPLETED"}>
                      {statusLabel(booking.status)}
                    </Badge>
                    {booking.kind === "private_course" ? (
                      <Badge>{booking.paymentStatus === "paid" ? "Paid" : booking.status === "AWAITING_PAYMENT" ? "Payment step · venue payment" : booking.status === "CONFIRMED" && booking.paymentStatus !== "paid" ? "Payment due at venue" : booking.status === "PENDING_COACH_CONFIRMATION" ? "Court reserved" : booking.status === "COACH_DECLINED" ? "Reservation released · no charge" : booking.status === "EXPIRED" ? "Reservation released" : "Private course"}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-zawana-500">
                    {booking.date} · {booking.time} · {booking.court?.name || booking.location}{booking.coach ? ` · ${booking.coach.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zawana-500">
                    {booking.code} · {Number(booking.price).toLocaleString()} MMK
                  </p>
                  {booking.kind === "private_course" && booking.status === "AWAITING_PAYMENT" && booking.paymentExpiresAt ? <p className="mt-2 text-sm font-bold text-amber-800">Confirm by {new Date(booking.paymentExpiresAt).toLocaleString()}. Payment will be arranged at the venue.</p> : null}
                  {booking.kind === "private_course" && booking.status === "CONFIRMED" && booking.paymentStatus !== "paid" ? <p className="mt-2 text-sm text-zawana-500">Your coach, court and time are confirmed. Payment has not been collected; please arrange it at the venue.</p> : null}
                  {booking.kind === "private_course" && booking.status === "PENDING_COACH_CONFIRMATION" ? <p className="mt-2 text-sm text-amber-800">Waiting for coach confirmation. Your selected court and time are reserved.</p> : null}
                  {booking.kind === "private_course" && booking.status === "EXPIRED" ? <p className="mt-2 text-sm text-zawana-500">The payment window expired. The court and coach time are available again.</p> : null}
                </div>
                <div className="flex gap-2">
                  {booking.kind === "private_course" && booking.status === "AWAITING_PAYMENT" ? <Button disabled={paying===booking.id} onClick={()=>confirmCourse(booking)}>{paying===booking.id?"Confirming…":"Confirm booking"}</Button> : null}
                  {booking.status === "PENDING_COACH_CONFIRMATION" ? (
                    <span className="inline-flex items-center rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Court reserved · awaiting coach</span>
                  ) : null}
                  {["confirmed", "CONFIRMED", "pending", "PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"].includes(booking.status) ? (
                    <Button variant="danger" disabled={cancelling===booking.id} onClick={() => cancel(booking)}>{cancelling===booking.id?"Cancelling…":"Cancel"}</Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
          {!bookings.length ? (
            <Empty title="No bookings yet" body="Your badminton court rentals and private courses will show up here." action={<Link to="/book/court"><Button>Book a court</Button></Link>} />
          ) : null}
          {pageInfo.totalPages>1&&<div className="flex items-center justify-between rounded-2xl border bg-white p-4 text-xs text-zawana-500"><span>Page {pageInfo.page} of {pageInfo.totalPages} · {pageInfo.total} bookings</span><div className="flex gap-2"><Button variant="secondary" className="px-3 py-2" disabled={page<=1||loading} onClick={()=>setPage(page-1)}><ChevronLeft size={15}/> Previous</Button><Button variant="secondary" className="px-3 py-2" disabled={page>=pageInfo.totalPages||loading} onClick={()=>setPage(page+1)}>Next <ChevronRight size={15}/></Button></div></div>}
        </div>
      )}
    </Page>
  );
}
