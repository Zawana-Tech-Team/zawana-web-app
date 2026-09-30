import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Clock3, LockKeyhole, MapPin, Sparkles, Trophy, X } from "lucide-react";
import { Button, Card, Page, Badge, Toast } from "../components/UI";
import { get, post } from "../api";

const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d});
const fmt=(d:Date)=>d.toISOString().slice(0,10);
const label=(d:Date)=>d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
const slots=Array.from({length:15},(_,i)=>{const h=6+i; const fmt=(x:number)=>{const ap=x>=12?"PM":"AM"; const hh=x%12||12; return `${hh}:00 ${ap}`}; return `${fmt(h)} — ${fmt(h+1)}`;});

export function CourtBooking(){
 const [date,setDate]=useState(fmt(days[0])); const [courts,setCourts]=useState<any[]>([]);
 const [selected,setSelected]=useState<any>(null); const [time,setTime]=useState(slots[2]);
 const [busy,setBusy]=useState<any[]>([]); const [blocks,setBlocks]=useState<any[]>([]); const [holiday,setHoliday]=useState<any>(null); const [done,setDone]=useState<any>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
 const [toast,setToast]=useState<string|null>(null);

 const load=async()=>{const [c,a]=await Promise.all([get<any[]>("/courts"),get<any>(`/bookings/availability?date=${date}`)]);setCourts(c);setBusy(a.bookings||[]);setBlocks(a.blocks||[]);setHoliday(a.holiday||null);setSelected(prev=>prev&&c.find(x=>x.id===prev.id)||c.find(x=>x.status==="available")||null)};
 useEffect(()=>{load().catch(e=>setError(e.message))},[date]);

 // Normalize both frontend slots ("6:00 AM — 7:00 AM") and backend
 // reservations ("06:00 — 07:00") before checking overlap. Weekly class
 // blocks are therefore visibly and functionally unavailable.
 const toMinutes=(value:string)=>{
   const v=String(value||"").trim();
   const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
   if(!m)return NaN;
   let h=Number(m[1]); const min=Number(m[2]);
   if(m[3]){if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;}
   return h*60+min;
 };
 const range=(value:string)=>{
   const p=String(value||"").split(/\s*(?:—|–|-)\s*/);
   if(p.length!==2)return null;
   const start=toMinutes(p[0]),end=toMinutes(p[1]);
   return Number.isFinite(start)&&Number.isFinite(end)?{start,end}:null;
 };
 const overlaps=(a:string,b:string)=>{const x=range(a),y=range(b);return !!x&&!!y&&x.start<y.end&&y.start<x.end;};
 const blockFor=(c:any,t:string)=>blocks.find(b=>b.courtId===c.id&&b.active!==false&&overlaps(`${b.start} — ${b.end}`,t));
 const bookingFor=(c:any,t:string)=>busy.find(b=>b.courtId===c.id&&overlaps(b.time,t));
 const available=(c:any,t:string)=>c.status==="available"&&!bookingFor(c,t)&&!blockFor(c,t);
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
   <div className="p-7"><div className="flex items-center justify-between border-b pb-5"><span className="text-sm text-zawana-500">Court rental</span><b>{done?.price?.toLocaleString()||((holiday?.active?Number(holiday.price):Number(selected?.price||0)+(slots.indexOf(time)>=9?5000:0)).toLocaleString())} MMK</b></div><p className="mt-5 text-xs uppercase tracking-widest text-zawana-500">Booking reference</p><p className="mt-1 font-black">{done.code}</p><div className="mt-7 flex gap-2"><Link to="/bookings"><Button>My bookings <ChevronRight size={15}/></Button></Link><Link to="/dashboard"><Button variant="secondary">Dashboard</Button></Link></div></div>
  </Card>{toast&&<Toast message={toast} onClose={()=>setToast(null)}/>}</Page>;

 return <Page title="Book a court" eyebrow="Zawana Badminton Arena" actions={<div className="hidden items-center gap-2 rounded-full bg-zawana-900 px-4 py-2 text-xs font-black md:flex"><LockKeyhole size={14}/> Live availability</div>}>
  <div className="grid gap-7 xl:grid-cols-[1fr_390px]">
   <div className="space-y-6">
    <Card className="overflow-hidden p-0"><div className="bg-zawana-950 p-6 text-white"><p className="eyebrow text-zawana-gold">STEP 01</p><h2 className="mt-1 text-xl font-black">Pick your day</h2></div><div className="grid grid-cols-4 gap-2 p-5 md:grid-cols-7">{days.map(d=><button key={fmt(d)} onClick={()=>setDate(fmt(d))} className={`rounded-2xl border p-3 text-left transition ${date===fmt(d)?"border-zawana-gold bg-zawana-gold/12 shadow-lg":"border-zawana-950/8 hover:-translate-y-0.5 hover:border-zawana-gold/50"}`}><span className="block text-[10px] font-black uppercase tracking-wider text-zawana-500">{d.toLocaleDateString("en-US",{weekday:"short"})}</span><b className="mt-2 block text-sm">{label(d)}</b></button>)}</div></Card>

    <Card className="overflow-hidden p-0"><div className="flex items-end justify-between bg-zawana-950 p-6 text-white"><div><p className="eyebrow text-zawana-gold">STEP 02</p><h2 className="mt-1 text-xl font-black">Choose your court</h2></div><div className="text-right"><p className="text-[10px] uppercase tracking-wider text-white/45">Live</p><b>{availableCourts.length} bookable</b></div></div>
      <div className="grid gap-4 p-5 md:grid-cols-2">{courts.map(c=>{const free=available(c,time);const activeBlock=blockFor(c,time);const activeBooking=bookingFor(c,time);const unavailableReason=activeBlock?`RESERVED · ${activeBlock.title||"CLASS"}`:activeBooking?"BOOKED":"UNAVAILABLE";return <button key={c.id} disabled={!free} onClick={()=>setSelected(c)} className={`group relative overflow-hidden rounded-[24px] border text-left transition duration-300 ${selected?.id===c.id?"border-zawana-gold bg-zawana-gold/8 shadow-[0_16px_40px_rgba(196,175,73,.15)]":activeBlock?"border-red-300 bg-red-50/70 shadow-[0_12px_30px_rgba(220,38,38,.10)]":"border-zawana-950/8 hover:-translate-y-1 hover:shadow-xl"} ${!free?"cursor-not-allowed":""}`}>
        <div className="court-lines relative h-32 overflow-hidden bg-zawana-950 p-4 text-white"><div className="absolute left-1/2 top-0 h-full w-px bg-white/15"/><div className="absolute inset-x-[20%] top-1/2 h-px bg-white/15"/><div className="absolute right-3 top-3">{activeBlock?<span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg"><LockKeyhole size={11}/> RESERVED</span>:<Badge good={free}>{free?"OPEN":unavailableReason}</Badge>}</div><div className="absolute bottom-3 left-4"><p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">{c.type}</p><h3 className="text-xl font-black">{c.name}</h3></div></div>
        <div className="p-4"><div className="flex justify-between gap-3"><span className="text-xs text-zawana-500">{activeBlock?<><span className="font-black text-red-700">{activeBlock.title||"Class reservation"}</span><span className="block mt-1 text-[10px] uppercase tracking-wider text-red-600">This slot is reserved every week</span></>:(c.features||[]).slice(0,2).join(" · ")||"Premium indoor facility"}</span><b className="whitespace-nowrap text-sm">{(holiday?.active?Number(holiday.price):Number(c.price)+(slots.indexOf(time)>=9?5000:0)).toLocaleString()} MMK</b></div><div className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zawana-500"><MapPin size={12}/> Arena floor · {bookedCount(c)} booked today</div></div>
      </button>})}</div>
      {!courts.length&&<div className="p-10 text-center text-sm text-zawana-500">No courts configured yet. Please check back soon.</div>}
    </Card>

    <Card className="overflow-hidden p-0"><div className="bg-zawana-950 p-6 text-white"><p className="eyebrow text-zawana-gold">STEP 03</p><h2 className="mt-1 text-xl font-black">Choose your session</h2><p className="mt-1 text-xs text-white/50">15 one-hour sessions · 6:00 AM–3:00 PM normal · 3:00 PM–9:00 PM +5,000 MMK · holidays use the configured holiday rate.</p></div><div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3">{slots.map(t=>{const free=selected?available(selected,t):false;return <button key={t} disabled={!free} onClick={()=>setTime(t)} className={`relative rounded-2xl border p-4 text-left transition ${time===t&&free?"border-zawana-gold bg-zawana-gold/10":!free&&selected&&blockFor(selected,t)?"border-red-300 bg-red-50 text-red-800":"border-zawana-950/8 hover:border-zawana-gold/40"} ${!free?"cursor-not-allowed":""}`}><Clock3 size={15} className={`mb-2 ${!free&&selected&&blockFor(selected,t)?"text-red-600":"text-zawana-gold"}`}/><span className="text-xs font-black">{t}</span>{!free&&<span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${selected&&blockFor(selected,t)?"bg-red-600 text-white":"bg-zawana-950 text-white"}`}>{selected&&blockFor(selected,t)?"RESERVED":"BOOKED"}</span>}</button>})}</div></Card>
    {error&&<div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700"><X size={17}/>{error}</div>}
   </div>

   <Card className="h-fit overflow-hidden p-0 shadow-[0_24px_70px_rgba(29,27,71,.10)] xl:sticky xl:top-24"><div className="court-lines bg-zawana-950 p-6 text-white"><div className="flex items-center justify-between"><div><p className="eyebrow text-zawana-gold">YOUR SESSION</p><h2 className="mt-1 text-2xl font-black">{selected?.name||"Choose a court"}</h2></div><Trophy className="text-zawana-gold"/></div></div><div className="p-6"><div className="space-y-4 text-sm"><div className="flex justify-between"><span className="text-zawana-500">Date</span><b>{date}</b></div><div className="flex justify-between"><span className="text-zawana-500">Time</span><b>{time}</b></div><div className="flex justify-between"><span className="text-zawana-500">Session</span><b>60 minutes</b></div><div className="border-t pt-4 flex justify-between text-base"><span className="font-black">Total</span><b>{selected?(holiday?.active?Number(holiday.price):Number(selected.price)+(slots.indexOf(time)>=9?5000:0)).toLocaleString():"—"} MMK</b></div></div><Button disabled={!selected||!available(selected,time)||loading} onClick={confirm} className="mt-6 w-full">{loading?"Securing court…":"Confirm & reserve"} <ChevronRight size={16}/></Button><div className="mt-4 flex gap-2 rounded-2xl bg-zawana-900 p-3 text-[11px] text-zawana-500"><Sparkles size={14} className="shrink-0 text-zawana-gold"/><span>Your booking immediately removes this court/session from the public availability grid.</span></div></div></Card>
  </div>
  {toast&&<Toast message={toast} type={error?"error":"success"} onClose={()=>setToast(null)}/>}
 </Page>
}
