import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, MapPin, ShoppingCart, Trophy, X } from "lucide-react";
import { Badge, Button, Card, Empty, Page, Toast } from "../components/UI";
import { get, post } from "../api";
import { useLanguage } from "../context/LanguageContext";

type SlotPick={date:string;courtId:string;courtName:string;time:string;price:number};
type Conflict={date?:string;courtId?:string;courtName?:string;time?:string;reason?:string};
const key=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseDate=(value:string)=>new Date(`${value}T00:00:00`);
const todayKey=()=>key(new Date());
const times=Array.from({length:15},(_,i)=>{const hour=6+i,fmt=(n:number)=>`${n%12||12}:00 ${n>=12?"PM":"AM"}`;return `${fmt(hour)} — ${fmt(hour+1)}`;});
const minute=(value:string)=>{const m=String(value||"").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);if(!m)return NaN;let h=Number(m[1]),min=Number(m[2]);if(m[3]){if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;}return h*60+min;};
const span=(value:string)=>{const p=String(value||"").split(/\s*(?:—|–|-)\s*/);if(p.length!==2)return null;const start=minute(p[0]),end=minute(p[1]);return Number.isFinite(start)&&Number.isFinite(end)?{start,end}:null;};
const overlaps=(a:string,b:string)=>{const x=span(a),y=span(b);return !!x&&!!y&&x.start<y.end&&y.start<x.end;};
const pickKey=(p:Pick<SlotPick,"date"|"courtId"|"time">)=>`${p.date}|${p.courtId}|${p.time}`;

export function CourtBooking(){
 const {locale}=useLanguage();
 const dateLabel=(value:string)=>parseDate(value).toLocaleDateString(locale,{month:"long",day:"numeric",year:"numeric"});
 const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
 const [date,setDate]=useState(todayKey());
 const [monthData,setMonthData]=useState<any>(null);
 const [loadingMonth,setLoadingMonth]=useState(true);
 const [selected,setSelected]=useState<SlotPick[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [conflicts,setConflicts]=useState<Conflict[]>([]);
 const [toast,setToast]=useState("");
 const [done,setDone]=useState<any[]|null>(null);
 const [checkoutOpen,setCheckoutOpen]=useState(false);
 const monthKey=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}`;

 const loadMonth=async()=>{
   setLoadingMonth(true);
   try{setMonthData(await get<any>(`/bookings/month-availability?month=${monthKey}`));}
   catch(e:any){setError(e.message||"Could not load court availability.");setMonthData(null);}
   finally{setLoadingMonth(false);}
 };
 useEffect(()=>{void loadMonth();},[monthKey]);

 const courts=monthData?.courts||[];
 const pickedDate=parseDate(date);
 const dateOverride=(monthData?.overrides||[]).find((x:any)=>x.date===date);
 const holiday=(monthData?.holidays||[]).find((x:any)=>x.date===date);
 const dayBookings=(monthData?.bookings||[]).filter((x:any)=>x.date===date);
 const dayBlocks=(monthData?.blocks||[]).filter((x:any)=>x.date===date||x.dayOfWeek===pickedDate.getDay());
 const blocksForDate=dateOverride?.type==="open"?dayBlocks.filter((x:any)=>x.date===date):dayBlocks;
 const courtOf=(id:string)=>courts.find((c:any)=>c.id===id);
 const dayBlocksFor=(courtId:string)=>blocksForDate.filter((b:any)=>b.courtId===courtId&&b.active!==false);
 const stateFor=(court:any,time:string)=>{
   if(dateOverride?.type==="closed")return "Closed";
   if(court.status!=="available")return "Unavailable";
   if(dayBlocksFor(court.id).some((b:any)=>overlaps(`${b.start} — ${b.end}`,time)))return "Reserved";
   const booking=dayBookings.find((b:any)=>b.courtId===court.id&&overlaps(b.time,time));
   if(booking)return ["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"].includes(booking.status)?"Reserved":"Booked";
   return "Available";
 };
 const priceFor=(court:any,time:string)=>{const start=span(time)?.start??0;return holiday?.active?Number(holiday.price):Number(court.price)+(start>=900?5000:0);};
 const toggle=(court:any,time:string,price:number)=>{
   const candidate={date,courtId:court.id,courtName:court.name,time,price};
   setSelected(prev=>prev.some(x=>pickKey(x)===pickKey(candidate))?prev.filter(x=>pickKey(x)!==pickKey(candidate)):[...prev,candidate]);
   setConflicts(prev=>prev.filter(x=>!(x.date===date&&x.courtId===court.id&&x.time===time)));
 };

 const firstOffset=new Date(month.getFullYear(),month.getMonth(),1).getDay();
 const mondayOffset=(firstOffset+6)%7;
 const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 const calendarCells=Array.from({length:Math.ceil((mondayOffset+daysInMonth)/7)*7},(_,i)=>{
   const day=i-mondayOffset+1;
   if(day<1||day>daysInMonth)return null;
   const d=new Date(month.getFullYear(),month.getMonth(),day),value=key(d),override=(monthData?.overrides||[]).find((x:any)=>x.date===value);
   const isPast=value<todayKey(),closed=override?.type==="closed";
   const blocks=(monthData?.blocks||[]).filter((x:any)=>x.date===value||x.dayOfWeek===d.getDay());
   const effectiveBlocks=override?.type==="open"?blocks.filter((x:any)=>x.date===value):blocks;
   const bookings=(monthData?.bookings||[]).filter((x:any)=>x.date===value);
   const hasCourt=courts.some((c:any)=>c.status==="available"&&times.some(time=>!effectiveBlocks.some((b:any)=>b.courtId===c.id&&b.active!==false&&overlaps(`${b.start} — ${b.end}`,time))&&!bookings.some((b:any)=>b.courtId===c.id&&overlaps(b.time,time))));
   const anyBooked=courts.length>0&&courts.every((c:any)=>c.status!=="available"||times.every((time:string)=>effectiveBlocks.some((b:any)=>b.courtId===c.id&&b.active!==false&&overlaps(`${b.start} — ${b.end}`,time))||bookings.some((b:any)=>b.courtId===c.id&&overlaps(b.time,time))));
   return {value,day,isPast,closed,hasCourt,anyBooked,today:value===todayKey(),override};
 });
 const total=selected.reduce((sum,s)=>sum+s.price,0);
 const grouped=useMemo(()=>{
   const byDate=new Map<string,Map<string,SlotPick[]>>();
   for(const pick of selected){if(!byDate.has(pick.date))byDate.set(pick.date,new Map());const byCourt=byDate.get(pick.date)!;if(!byCourt.has(pick.courtName))byCourt.set(pick.courtName,[]);byCourt.get(pick.courtName)!.push(pick);}
   return [...byDate.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,courts])=>({date:day,courts:[...courts.entries()]}));
 },[selected]);

 const confirm=async()=>{
   if(!selected.length||busy)return;
   setBusy(true);setError("");setConflicts([]);
   try{
     const result=await post<any>("/bookings",{kind:"court",date:selected[0].date,bookings:selected.map(({date,courtId,time})=>({date,courtId,time}))});
     const bookings=result.bookings||[result.booking];
     setDone(bookings);setToast(`${bookings.length} court session${bookings.length===1?"":"s"} confirmed.`);setSelected([]);await loadMonth();
   }catch(e:any){setError(e.message||"Your booking could not be confirmed. Refresh availability and try again.");setConflicts(Array.isArray(e.details)?e.details:[]);setToast(e.message||"Some selected slots are no longer available.");await loadMonth();}
   finally{setBusy(false);}
 };

 if(done)return <Page title="Court booking confirmed" eyebrow="Zawana Badminton Arena"><Card className="mx-auto max-w-3xl overflow-hidden p-0"><div className="bg-zawana-950 p-7 text-white md:p-9"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-zawana-gold text-zawana-950"><Check/></span><div><p className="eyebrow text-zawana-gold">CONFIRMED</p><h2 className="text-2xl font-black">Your court time is secured</h2></div></div><p className="mt-5 text-sm text-white/65">{done.length} session{done.length===1?"":"s"} across {[...new Set(done.map((b:any)=>b.date))].length} date{new Set(done.map((b:any)=>b.date)).size===1?"":"s"}</p></div><div className="p-6"><div className="divide-y">{done.map((b:any)=><div key={b.id} className="flex flex-wrap justify-between gap-3 py-3"><div><b>{b.title}</b><p className="text-sm text-zawana-500">{dateLabel(b.date)} · {b.time} · Ref {b.code}</p></div><b>{Number(b.price).toLocaleString(locale)} MMK</b></div>)}</div><p className="mt-4 flex justify-between border-t pt-4 font-black"><span>Total</span><span>{done.reduce((sum:number,b:any)=>sum+Number(b.price),0).toLocaleString(locale)} MMK</span></p><p className="mt-3 text-xs text-zawana-500">Your court sessions are confirmed. Payment checkout is currently unavailable.</p><div className="mt-6 flex flex-wrap gap-2"><Button onClick={()=>setDone(null)}>Book more court time</Button><Link to="/bookings"><Button variant="secondary">My bookings <ChevronRight size={15}/></Button></Link></div></div></Card>{toast&&<Toast message={toast} onClose={()=>setToast("")}/>}</Page>;

 return <Page title="Book a court" eyebrow="Zawana Badminton Arena" actions={<div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full bg-zawana-900 px-4 py-2 text-xs font-black sm:flex"><CalendarDays size={14}/> Live availability</div><button type="button" onClick={()=>setCheckoutOpen(true)} aria-label={`Open checkout, ${selected.length} selected sessions`} className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-zawana-950 text-white shadow-lg transition hover:bg-zawana-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zawana-gold"><ShoppingCart size={19}/>{selected.length>0&&<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-zawana-gold px-1 text-[10px] font-black text-zawana-950">{selected.length}</span>}</button></div>}>
   <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
    <div className="space-y-5">
      {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">{error}</p>{conflicts.length>0&&<ul className="mt-2 space-y-1">{conflicts.map((c,i)=><li key={`${c.date}-${c.courtId}-${c.time}-${i}`}><b>{c.courtName||courtOf(c.courtId||"")?.name||"Court"}</b> · {c.date?dateLabel(c.date):""} · {c.time} — {c.reason||"No longer available."}</li>)}</ul>}</div>}
      <Card className="overflow-hidden p-0"><div className="flex flex-wrap items-center justify-between gap-4 bg-zawana-950 p-5 text-white sm:p-6"><div><p className="eyebrow text-zawana-gold">COURT RENTAL</p><h2 className="mt-1 text-xl font-black">Choose your dates</h2><p className="mt-1 text-xs text-white/55">Build one booking from different courts and times across multiple dates.</p></div><div className="flex items-center gap-2"><button aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="rounded-xl border border-white/20 p-2 hover:bg-white/10"><ChevronLeft size={18}/></button><b className="min-w-32 text-center">{month.toLocaleDateString(locale,{month:"long",year:"numeric"})}</b><button aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="rounded-xl border border-white/20 p-2 hover:bg-white/10"><ChevronRight size={18}/></button></div></div>
       <div className="p-3 sm:p-6"><div className="grid grid-cols-7 gap-1 sm:gap-2">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=><div key={x} className="py-2 text-center text-[9px] font-black uppercase tracking-wider text-zawana-500 sm:text-[11px]">{x}</div>)}
        {calendarCells.map((cell:any,i)=><div key={cell?.value||`blank-${i}`} className="min-w-0">{cell&&(()=>{const hasPicks=selected.some(x=>x.date===cell.value);return <button disabled={cell.isPast||cell.closed||!cell.hasCourt||loadingMonth} aria-pressed={date===cell.value||hasPicks} onClick={()=>{setDate(cell.value);setError("");setConflicts([])}} className={`flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-xl border text-xs transition sm:min-h-[62px] sm:text-sm ${date===cell.value?"border-zawana-gold bg-zawana-gold/15 font-black text-zawana-950":hasPicks?"border-zawana-accent/50 bg-zawana-accent/5 font-bold":"border-transparent hover:border-zawana-950/10"} ${cell.today?"ring-1 ring-zawana-gold":""} ${cell.isPast||cell.closed||!cell.hasCourt?"cursor-not-allowed text-zawana-400 opacity-45":""}`}><span>{cell.day}</span><span className={`h-1.5 w-1.5 rounded-full ${cell.closed?"bg-red-500":hasPicks?"bg-zawana-accent":cell.hasCourt?"bg-emerald-500":cell.anyBooked?"bg-zawana-950/30":"bg-transparent"}`}/></button>})()}</div>)}
       </div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-zawana-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-zawana-gold"/>Today / selected</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500"/>Available</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500"/>Closed</span><span className="opacity-60">Faded dates are past or fully booked</span></div>
       </div></Card>

      <Card className="p-4 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-zawana-accent">SELECT COURT & TIME</p><h2 className="mt-1 text-xl font-black">{dateLabel(date)}</h2>{dateOverride?.type==="open"&&<p className="mt-1 text-sm font-bold text-emerald-700">{dateOverride.title} · recurring weekday blocks are overridden for this date only.</p>}{holiday?.active&&<p className="mt-1 text-sm text-zawana-500">Holiday rate · {Number(holiday.price).toLocaleString(locale)} MMK / session</p>}</div><span className="text-xs font-bold text-zawana-500">{selected.filter(x=>x.date===date).length} selected for this date</span></div>
       {loadingMonth?<div className="mt-5 grid animate-pulse gap-3">{[1,2].map(n=><div key={n} className="h-32 rounded-2xl bg-zawana-950/5"/>)}</div>:date.slice(0,7)!==monthKey?<div className="mt-5 rounded-2xl bg-zawana-900 p-5 text-sm text-zawana-500">Choose a date in {month.toLocaleDateString(locale,{month:"long",year:"numeric"})} to see court availability. Your selections from other months remain in the booking summary.</div>:dateOverride?.type==="closed"?<div className="mt-5 rounded-2xl bg-red-50 p-5 text-sm text-red-800">Courts are unavailable on this date: {dateOverride.reason||dateOverride.title}.</div>:courts.length?<div className="mt-5 space-y-4">{courts.map((court:any)=>{const slots=times.map(time=>({time,state:stateFor(court,time),price:priceFor(court,time)})),open=slots.filter(s=>s.state==="Available").length;return <section key={court.id} className="rounded-2xl border border-zawana-950/8 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-zawana-950 text-zawana-gold"><Trophy size={18}/></span><div><h3 className="font-black">{court.name}</h3><p className="text-xs text-zawana-500">{court.surface} · {Number(court.price).toLocaleString(locale)} MMK base</p></div></div><Badge good={open>0}>{open?`${open} available`:court.status==="available"?"Fully booked":court.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{slots.map(({time,state,price}:any)=>{const isSelected=selected.some(x=>x.date===date&&x.courtId===court.id&&x.time===time),enabled=state==="Available"||isSelected;return <button type="button" key={time} disabled={!enabled} onClick={()=>toggle(court,time,price)} aria-pressed={isSelected} className={`min-w-0 rounded-xl border px-2.5 py-3 text-left transition sm:px-3 ${isSelected?"border-zawana-gold bg-zawana-gold/20 ring-1 ring-zawana-gold":"border-zawana-950/8"} ${state==="Available"&&!isSelected?"hover:border-emerald-400 hover:bg-emerald-50":""} ${!enabled?"cursor-not-allowed bg-zawana-900 opacity-65":""}`}><span className="flex items-center justify-between gap-1"><span className="text-xs font-black sm:text-sm">{time.split(" — ")[0]}</span>{isSelected?<Check size={14}/>:state==="Available"?<Clock3 size={14} className="text-emerald-600"/>:null}</span><span className={`mt-1 block text-[9px] font-black uppercase tracking-wide ${isSelected?"text-zawana-950":state==="Available"?"text-emerald-700":state==="Reserved"||state==="Closed"?"text-red-700":"text-zawana-500"}`}>{isSelected?"Selected":state}</span>{state==="Available"&&<span className="mt-1 block text-[10px] text-zawana-500">{price.toLocaleString(locale)} MMK</span>}</button>})}</div></section>})}</div>:<Empty title="No courts configured" body="Court availability will appear here once the badminton courts are set up."/>}
      </Card>
    </div>

    <div id="booking-summary"><Card className="h-fit overflow-hidden p-0 xl:sticky xl:top-24"><div className="bg-zawana-950 p-5 text-white"><p className="eyebrow text-zawana-gold">BOOKING SUMMARY</p><h2 className="mt-1 text-xl font-black">Review your sessions</h2></div><div className="p-5">{selected.length?<><div className="my-4 space-y-4">{grouped.map(day=><div key={day.date} className="rounded-xl bg-zawana-900 p-3"><div className="mb-3 flex items-center gap-2 text-sm font-black"><MapPin size={14} className="text-zawana-gold"/>{dateLabel(day.date)}</div>{day.courts.map(([courtName,picks])=><div key={courtName} className="mb-2 border-t border-zawana-950/8 pt-2 last:mb-0"><div className="mb-1 text-xs font-black">{courtName}</div>{picks.map(p=><div key={pickKey(p)} className="flex items-center justify-between gap-2 py-1 text-xs"><span>{p.time}</span><span className="flex items-center gap-2"><b>{p.price.toLocaleString(locale)} MMK</b><button aria-label={`Remove ${courtName} ${p.time} on ${p.date}`} onClick={()=>setSelected(prev=>prev.filter(x=>pickKey(x)!==pickKey(p)))} className="rounded p-1 hover:bg-red-50 hover:text-red-600"><X size={13}/></button></span></div>)}</div>)}</div>)}</div><div className="flex justify-between border-t pt-4 text-sm"><span>{selected.length} session{selected.length===1?"":"s"}</span><b>{total.toLocaleString(locale)} MMK</b></div><Button disabled={busy||loadingMonth} onClick={confirm} className="mt-5 w-full">{busy?"Confirming bookings…":"Confirm all bookings"} <ChevronRight size={16}/></Button><p className="mt-3 text-center text-[11px] leading-5 text-zawana-500">The server rechecks every date, court and time. All sessions confirm together, or none are saved.</p></>:<div className="py-7 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-zawana-900"><CalendarDays className="text-zawana-500" size={19}/></div><p className="mt-3 text-sm font-bold">No sessions selected</p><p className="mt-1 text-xs leading-5 text-zawana-500">Choose available times across any date in this month.</p></div>}<Link to="/bookings" className="mt-5 block border-t pt-4 text-center text-xs font-bold text-zawana-500">View booking history <ChevronRight className="inline" size={13}/></Link></div></Card></div>
   </div>{checkoutOpen&&<div className="fixed inset-0 z-[110] flex justify-end bg-zawana-950/45 backdrop-blur-[2px]" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckoutOpen(false)}}><motion.section initial={{x:'100%'}} animate={{x:0}} transition={{type:'spring',damping:30,stiffness:280}} role="dialog" aria-modal="true" aria-labelledby="mobile-checkout-title" className="flex h-full w-full max-w-md flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl"><header className="flex items-center justify-between border-b p-5"><div><p className="eyebrow text-zawana-accent">COURT RENTAL</p><h2 id="mobile-checkout-title" className="mt-1 text-xl font-black">Review checkout</h2><p className="mt-1 text-xs text-zawana-500">{selected.length} selected session{selected.length===1?"":"s"}</p></div><button onClick={()=>setCheckoutOpen(false)} aria-label="Close checkout" className="grid h-11 w-11 place-items-center rounded-full bg-zawana-950/5"><X size={19}/></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5">{selected.length?grouped.map(day=><div key={day.date} className="mb-4 rounded-2xl border p-4"><h3 className="font-black">{dateLabel(day.date)}</h3>{day.courts.map(([courtName,picks])=><div key={courtName} className="mt-3 border-t pt-3"><b className="text-sm">{courtName}</b>{picks.map(p=><div key={pickKey(p)} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0">{p.time}</span><span className="flex shrink-0 items-center gap-2"><b>{p.price.toLocaleString(locale)} MMK</b><button aria-label={`Remove ${courtName} ${p.time} on ${p.date}`} onClick={()=>setSelected(prev=>prev.filter(x=>pickKey(x)!==pickKey(p)))} className="grid h-9 w-9 place-items-center rounded-full text-zawana-500 hover:bg-red-50 hover:text-red-700"><X size={15}/></button></span></div>)}</div>)}</div>):<div className="py-14 text-center"><ShoppingCart size={28} className="mx-auto text-zawana-400"/><p className="mt-3 font-black">No sessions selected</p><p className="mt-1 text-sm text-zawana-500">Choose an available court and time to add it here.</p></div>}{error&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div><footer className="border-t bg-white p-5"><div className="mb-4 flex items-center justify-between"><span className="text-sm text-zawana-500">Total</span><b className="text-xl">{total.toLocaleString(locale)} MMK</b></div><Button disabled={!selected.length||busy||loadingMonth} onClick={confirm} className="w-full">{busy?"Confirming bookings…":"Confirm all bookings"}<ChevronRight size={16}/></Button><p className="mt-3 text-center text-[11px] leading-5 text-zawana-500">Availability is rechecked before the existing booking confirmation runs.</p></footer></motion.section></div>}{toast&&<Toast message={toast} type={error?"error":"success"} onClose={()=>setToast("")}/>}</Page>;
}
