import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Clock3, LockKeyhole, MapPin, Sparkles, Trophy, X } from "lucide-react";
import { Button, Card, Page, Badge, Toast } from "../components/UI";
import { get, post } from "../api";

const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d});
const fmt=(d:Date)=>d.toISOString().slice(0,10);
const label=(d:Date)=>d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
const slots=["5:00 PM — 6:00 PM","5:30 PM — 6:30 PM","6:00 PM — 7:00 PM","6:30 PM — 7:30 PM","7:00 PM — 8:00 PM","7:30 PM — 8:30 PM"];

export function CourtBooking(){
 const [date,setDate]=useState(fmt(days[0])); const [courts,setCourts]=useState<any[]>([]);
 const [selected,setSelected]=useState<any>(null); const [time,setTime]=useState(slots[2]);
 const [busy,setBusy]=useState<any[]>([]); const [done,setDone]=useState<any>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
 const [toast,setToast]=useState<string|null>(null);

 const load=async()=>{const [c,b]=await Promise.all([get<any[]>("/courts"),get<any[]>(`/bookings/availability?date=${date}`)]);setCourts(c);setBusy(b);setSelected(prev=>prev&&c.find(x=>x.id===prev.id)||c.find(x=>x.status==="available")||null)};
 useEffect(()=>{load().catch(e=>setError(e.message))},[date]);

 // A court is bookable only when its operational status is available AND the chosen slot is free.
 const available=(c:any,t:string)=>c.status==="available"&&!busy.some(b=>b.courtId===c.id&&b.time===t);
 const bookedCount=(c:any)=>busy.filter(b=>b.courtId===c.id).length;

 const confirm=async()=>{
   if(!selected||!available(selected,time))return;
   setError("");setLoading(true);
   try{
    const b=await post<any>("/bookings",{kind:"court",title:selected.name,date,time,location:"Zawana Badminton Arena",price:selected.price,courtId:selected.id,paymentStatus:"pending"});
    setDone(b);setToast("Court locked successfully — your session is reserved.");
   } catch(e:any){setError(e.message);setToast(e.message||"That slot is no longer available.");await load()}
   finally{setLoading(false)}
 };
 const availableCourts=useMemo(()=>courts.filter(c=>c.status==="available"),[courts]);

 if(done)return <Page title="Court secured" eyebrow="Booking confirmed">
  <Card className="mx-auto max-w-2xl overflow-hidden p-0 shadow-[0_30px_90px_rgba(29,27,71,.14)]">
   <div className="court-lines relative overflow-hidden bg-zawana-950 p-8 text-white md:p-10"><div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-zawana-gold/30"/><div className="relative flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zawana-gold text-zawana-950"><Check/></span><div><p className="eyebrow text-zawana-gold">RESERVED</p><h2 className="text-3xl font-black">{selected?.name}</h2></div></div><div className="relative mt-8 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/8 p-4"><p className="text-[10px] uppercase tracking-widest text-white/45">Date</p><b className="mt-1 block">{date}</b></div><div className="rounded-2xl bg-white/8 p-4"><p className="text-[10px] uppercase tracking-widest text-white/45">Session</p><b className="mt-1 block">{time}</b></div></div></div>
   <div className="p-7"><div className="flex items-center justify-between border-b pb-5"><span className="text-sm text-zawana-500">Court rental</span><b>{selected?.price?.toLocaleString()} MMK</b></div><p className="mt-5 text-xs uppercase tracking-widest text-zawana-500">Booking reference</p><p className="mt-1 font-black">{done.code}</p><div className="mt-7 flex gap-2"><Link to="/bookings"><Button>My bookings <ChevronRight size={15}/></Button></Link><Link to="/dashboard"><Button variant="secondary">Dashboard</Button></Link></div></div>
  </Card>{toast&&<Toast message={toast} onClose={()=>setToast(null)}/>}</Page>;

 return <Page title="Book a court" eyebrow="Zawana Badminton Arena" actions={<div className="hidden items-center gap-2 rounded-full bg-zawana-900 px-4 py-2 text-xs font-black md:flex"><LockKeyhole size={14}/> Live availability</div>}>
  <div className="grid gap-7 xl:grid-cols-[1fr_390px]">
   <div className="space-y-6">
    <Card className="overflow-hidden p-0"><div className="bg-zawana-950 p-6 text-white"><p className="eyebrow text-zawana-gold">STEP 01</p><h2 className="mt-1 text-xl font-black">Pick your day</h2></div><div className="grid grid-cols-4 gap-2 p-5 md:grid-cols-7">{days.map(d=><button key={fmt(d)} onClick={()=>setDate(fmt(d))} className={`rounded-2xl border p-3 text-left transition ${date===fmt(d)?"border-zawana-gold bg-zawana-gold/12 shadow-lg":"border-zawana-950/8 hover:-translate-y-0.5 hover:border-zawana-gold/50"}`}><span className="block text-[10px] font-black uppercase tracking-wider text-zawana-500">{d.toLocaleDateString("en-US",{weekday:"short"})}</span><b className="mt-2 block text-sm">{label(d)}</b></button>)}</div></Card>

    <Card className="overflow-hidden p-0"><div className="flex items-end justify-between bg-zawana-950 p-6 text-white"><div><p className="eyebrow text-zawana-gold">STEP 02</p><h2 className="mt-1 text-xl font-black">Choose your court</h2></div><div className="text-right"><p className="text-[10px] uppercase tracking-wider text-white/45">Live</p><b>{availableCourts.length} bookable</b></div></div>
      <div className="grid gap-4 p-5 md:grid-cols-2">{courts.map(c=>{const free=available(c,time);return <button key={c.id} disabled={!free} onClick={()=>setSelected(c)} className={`group relative overflow-hidden rounded-[24px] border text-left transition duration-300 ${selected?.id===c.id?"border-zawana-gold bg-zawana-gold/8 shadow-[0_16px_40px_rgba(196,175,73,.15)]":"border-zawana-950/8 hover:-translate-y-1 hover:shadow-xl"} ${!free?"cursor-not-allowed opacity-55":""}`}>
        <div className="court-lines relative h-32 overflow-hidden bg-zawana-950 p-4 text-white"><div className="absolute left-1/2 top-0 h-full w-px bg-white/15"/><div className="absolute inset-x-[20%] top-1/2 h-px bg-white/15"/><div className="absolute right-3 top-3"><Badge good={free}>{free?"OPEN":"UNAVAILABLE"}</Badge></div><div className="absolute bottom-3 left-4"><p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">{c.type}</p><h3 className="text-xl font-black">{c.name}</h3></div></div>
        <div className="p-4"><div className="flex justify-between gap-3"><span className="text-xs text-zawana-500">{(c.features||[]).slice(0,2).join(" · ")||"Premium indoor facility"}</span><b className="whitespace-nowrap text-sm">{Number(c.price).toLocaleString()} MMK</b></div><div className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zawana-500"><MapPin size={12}/> Arena floor · {bookedCount(c)} booked today</div></div>
      </button>})}</div>
      {!courts.length&&<div className="p-10 text-center text-sm text-zawana-500">No courts configured yet. Please check back soon.</div>}
    </Card>

    <Card className="overflow-hidden p-0"><div className="bg-zawana-950 p-6 text-white"><p className="eyebrow text-zawana-gold">STEP 03</p><h2 className="mt-1 text-xl font-black">Choose your session</h2><p className="mt-1 text-xs text-white/50">Occupied slots are automatically locked after another customer books them.</p></div><div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3">{slots.map(t=>{const free=selected?available(selected,t):false;return <button key={t} disabled={!free} onClick={()=>setTime(t)} className={`relative rounded-2xl border p-4 text-left transition ${time===t&&free?"border-zawana-gold bg-zawana-gold/10":"border-zawana-950/8 hover:border-zawana-gold/40"} ${!free?"cursor-not-allowed opacity-45":""}`}><Clock3 size={15} className="mb-2 text-zawana-gold"/><span className="text-xs font-black">{t}</span>{!free&&<span className="absolute right-3 top-3"><LockKeyhole size={13}/></span>}</button>})}</div></Card>
    {error&&<div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700"><X size={17}/>{error}</div>}
   </div>

   <Card className="h-fit overflow-hidden p-0 shadow-[0_24px_70px_rgba(29,27,71,.10)] xl:sticky xl:top-24"><div className="court-lines bg-zawana-950 p-6 text-white"><div className="flex items-center justify-between"><div><p className="eyebrow text-zawana-gold">YOUR SESSION</p><h2 className="mt-1 text-2xl font-black">{selected?.name||"Choose a court"}</h2></div><Trophy className="text-zawana-gold"/></div></div><div className="p-6"><div className="space-y-4 text-sm"><div className="flex justify-between"><span className="text-zawana-500">Date</span><b>{date}</b></div><div className="flex justify-between"><span className="text-zawana-500">Time</span><b>{time}</b></div><div className="flex justify-between"><span className="text-zawana-500">Session</span><b>60 minutes</b></div><div className="border-t pt-4 flex justify-between text-base"><span className="font-black">Total</span><b>{selected?Number(selected.price).toLocaleString():"—"} MMK</b></div></div><Button disabled={!selected||!available(selected,time)||loading} onClick={confirm} className="mt-6 w-full">{loading?"Securing court…":"Confirm & reserve"} <ChevronRight size={16}/></Button><div className="mt-4 flex gap-2 rounded-2xl bg-zawana-900 p-3 text-[11px] text-zawana-500"><Sparkles size={14} className="shrink-0 text-zawana-gold"/><span>Your booking immediately removes this court/session from the public availability grid.</span></div></div></Card>
  </div>
  {toast&&<Toast message={toast} type={error?"error":"success"} onClose={()=>setToast(null)}/>}
 </Page>
}
