import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, UserRound, X } from 'lucide-react';
import { Badge, Button, Card, Empty, Page } from '../components/UI';
import { get, post } from '../api';
import { mediaImageSrc } from '../components/ImageUpload';

const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const minute=(v:string)=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);if(!m)return NaN;let h=+m[1];if(m[3]){if(h===12)h=0;if(m[3].toUpperCase()==='PM')h+=12}return h*60+ +m[2]};
const span=(v:string)=>{const p=String(v||'').split(/\s*(?:—|–|-)\s*/);const a=minute(p[0]||''),b=minute(p[1]||'');return p.length===2&&b>a?{start:a,end:b}:null};
const slot=(start:number,duration:number)=>{const label=(n:number)=>`${Math.floor(n%1440/60)%12||12}:${String(n%60).padStart(2,'0')} ${n%1440>=720?'PM':'AM'}`;return `${label(start)} — ${label(start+duration)}`};

export function PrivateCourse(){
 const [courses,setCourses]=useState<any[]>([]),[coaches,setCoaches]=useState<any[]>([]),[courts,setCourts]=useState<any[]>([]),[availability,setAvailability]=useState<any>(null);
 const [course,setCourse]=useState<any>(null),[coach,setCoach]=useState<any>(null),[court,setCourt]=useState<any>(null);
 const [date,setDate]=useState(dateKey(new Date())),[time,setTime]=useState(''),[availabilityOpen,setAvailabilityOpen]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const navigate=useNavigate();
 const days=useMemo(()=>Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d}),[]);
 const courseSlots=useMemo(()=>Array.from({length:Math.max(0,Math.floor((15*60-(course?.duration||60))/60)+1)},(_,i)=>slot((6+i)*60,course?.duration||60)),[course]);

 useEffect(()=>{Promise.all([get<any[]>('/private-courses'),get<any[]>('/courts')]).then(([c,ct])=>{setCourses(c);setCoaches([...new Map(c.flatMap((course:any)=>course.coaches||[]).map((coach:any)=>[coach.id,coach])).values()]);setCourts(ct)}).catch((e:any)=>setError(e.message||'Could not load private course options.'))},[]);
 useEffect(()=>{if(!court||!availabilityOpen)return;setAvailability(null);get<any>(`/bookings/availability?date=${date}`).then(setAvailability).catch((e:any)=>setError(e.message||'Could not load court availability.'))},[date,court,availabilityOpen]);

 const courseOptions=courses;
 const eligibleCoaches=coaches.filter(c=>c.status==='active'&&c.user?.active&&course?.coaches?.some((x:any)=>x.id===c.id));
 const coursePrice=Number(course?.price??0);
 const coachAt=(c:any,t:string)=>{const wanted=span(t);return !!wanted&&!availability?.bookings?.some((b:any)=>b.coachId===c.id&&(()=>{const booked=span(b.time);return !!booked&&wanted.start<booked.end&&booked.start<wanted.end})())};
 const freeAt=(c:any,t:string)=>{const wanted=span(t);if(c.status!=='available'||!wanted||!availability||availability.closed)return false;if(date===dateKey(new Date())&&wanted.start<=new Date().getHours()*60+new Date().getMinutes())return false;const booked=(availability.bookings||[]).some((b:any)=>b.courtId===c.id&&(()=>{const r=span(b.time);return !!r&&wanted.start<r.end&&r.start<wanted.end})());const blocked=(availability.blocks||[]).some((b:any)=>b.courtId===c.id&&b.active!==false&&(()=>{const r=span(`${b.start} — ${b.end}`);return !!r&&wanted.start<r.end&&r.start<wanted.end})());return !booked&&!blocked};
 const slotAvailable=(t:string)=>courts.some(c=>freeAt(c,t));
 const submit=async()=>{if(!course||!coach||!court||!time)return;setBusy(true);setError('');try{await post('/member/private-courses',{courseId:course.id,courtId:court.id,coachId:coach.id,date,time});navigate('/bookings')}catch(e:any){setError(e.message||'Could not confirm this booking. Check availability and try again.')}finally{setBusy(false)}};

 return <Page title="Private course" eyebrow="Badminton coaching" actions={<Link to="/book/court" className="text-sm font-bold">Court rental <ArrowRight className="inline" size={15}/></Link>}>
  <p className="mb-6 max-w-3xl text-sm leading-6 text-zawana-500">Choose a course, one of its assigned coaches, then select a court and an available time. The price shown is the course price. Court rentals and active reservations share the same availability calendar.</p>
  <div className="grid gap-6 xl:grid-cols-[1fr_360px]"><div className="space-y-5">
   <Card className="p-5"><p className="text-xs font-black uppercase tracking-widest text-zawana-accent">01 · SELECT PRIVATE COURSE</p>{courseOptions.length?<div className="mt-4 grid gap-3 sm:grid-cols-2">{courseOptions.map(c=><button key={c.id} onClick={()=>{setCourse(c);setCoach(null);setCourt(null);setTime('')}} className={`overflow-hidden rounded-2xl border text-left transition ${course?.id===c.id?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/10 hover:border-zawana-accent/50'}`}>{c.imageUrl&&<img src={c.imageUrl} alt="" className="h-32 w-full object-cover"/>}<span className="block p-4"><span className="flex items-center justify-between gap-2"><b>{c.title}</b><Badge>{c.duration} min</Badge></span><span className="mt-2 block text-sm text-zawana-500">{c.description||'Badminton private coaching'}</span><span className="mt-3 block text-xs font-bold text-zawana-500">{c.category||'Private Training'}</span><span className="mt-2 block text-sm font-black">{Number(c.price).toLocaleString()} MMK</span></span></button>)}</div>:<div className="mt-4"><Empty title="No private courses available" body="Ask an administrator to add an active private course."/></div>}</Card>
   {course&&<Card className="p-5"><p className="text-xs font-black uppercase tracking-widest text-zawana-accent">02 · CHOOSE COACH</p><p className="mt-1 text-sm text-zawana-500">These are the active badminton coaches assigned to {course.title}. The course price is the same whichever assigned coach you choose.</p>{eligibleCoaches.length?<div className="mt-4 grid gap-4 sm:grid-cols-2">{eligibleCoaches.map(c=><button key={c.id} onClick={()=>{setCoach(c);setCourt(null);setTime('')}} className={`group overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:shadow-lg ${coach?.id===c.id?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/10 hover:border-zawana-accent/60'}`}><span className="relative block h-52 w-full overflow-hidden bg-zawana-950/5 sm:h-60">{c.imageUrl||c.user?.avatar?<img src={mediaImageSrc(c.imageUrl||c.user?.avatar)} alt={`${c.user?.name||c.name}, badminton coach`} className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.03]"/>:<span className="grid h-full w-full place-items-center text-zawana-400"><UserRound size={48}/></span>}<span className="absolute bottom-3 left-3"><Badge good>{coach?.id===c.id?'Selected':'Available'}</Badge></span></span><span className="block p-4"><b className="block text-lg">{c.user?.name||c.name}</b><span className="mt-1 block text-sm text-zawana-500">{c.specialty||'Badminton coach'}</span><span className="mt-3 block border-t pt-3 text-sm font-black">Course price · {coursePrice.toLocaleString()} MMK</span></span></button>)}</div>:<div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No active badminton coach is assigned to this course yet. An administrator can assign coaches in Private Course Management.</div>}</Card>}
   {coach&&<Card className="p-5"><p className="text-xs font-black uppercase tracking-widest text-zawana-accent">03 · SELECT COURT</p><p className="mt-1 text-sm text-zawana-500">Select a court to open dates and live time slots.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{courts.map(c=><button key={c.id} disabled={c.status!=='available'} onClick={()=>{setCourt(c);setTime('');setAvailabilityOpen(true)}} className={`flex items-center justify-between rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${court?.id===c.id?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/10 hover:border-zawana-accent/50'}`}><span><b>{c.name}</b><span className="mt-1 block text-xs text-zawana-500">{c.surface} · included with course</span></span><Badge good={c.status==='available'}>{c.status==='available'?'Choose time':c.status}</Badge></button>)}</div></Card>}
   {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  </div>
  <Card className="h-fit p-5 xl:sticky xl:top-24">
  <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">
    BOOKING SUMMARY
  </p>

  <h2 className="mt-3 text-xl font-black">
    {course?.title || 'Badminton Private Course'}
  </h2>

  <div className="my-5 space-y-3 border-y border-zawana-950/8 py-4 text-sm">
    <p className="flex justify-between">
      <span className="text-zawana-500">Coach</span>
      <b>{coach?.user?.name || coach?.name || '—'}</b>
    </p>

    <p className="flex justify-between">
      <span className="text-zawana-500">Court</span>
      <b>{court?.name || '—'}</b>
    </p>

    <p className="flex justify-between">
      <span className="text-zawana-500">Date</span>
      <b>{date}</b>
    </p>

    <p className="flex justify-between">
      <span className="text-zawana-500">Time</span>
      <b>{time || '—'}</b>
    </p>

    <p className="flex justify-between border-t pt-3">
      <span className="font-black">Course price</span>
      <b>{course && coach ? `${coursePrice.toLocaleString()} MMK` : '—'}</b>
    </p>
  </div>

  <Button
    disabled={!course || !coach || !court || !time || busy}
    onClick={submit}
    className="w-full"
  >
    {busy ? 'Sending request…' : 'Request private course'} <ArrowRight size={15} />
  </Button>

  <p className="mt-3 text-xs leading-5 text-zawana-500">
    This sends a request to your selected coach. Your court and time stay reserved while the coach reviews it. If accepted, you will have 24 hours to pay and confirm the course.
  </p>
</Card>
  </div>
   {availabilityOpen&&court&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-zawana-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setAvailabilityOpen(false)}}><div role="dialog" aria-modal="true" aria-labelledby="private-availability-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-zawana-accent">PRIVATE COURSE · 04 · DATE & TIME · {court.name}</p><h2 id="private-availability-title" className="mt-1 text-2xl font-black">Choose date & time</h2><p className="mt-1 text-sm text-zawana-500">
  {course.title} · {course.duration} minutes
</p></div><button aria-label="Close availability" onClick={()=>setAvailabilityOpen(false)} className="rounded-full border p-2"><X size={18}/></button></div><div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">{days.map(d=><button key={dateKey(d)} onClick={()=>{setDate(dateKey(d));setTime('')}} className={`rounded-xl border p-2 text-left ${date===dateKey(d)?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/10'}`}><span className="block text-[10px] font-bold uppercase text-zawana-500">{d.toLocaleDateString('en-US',{weekday:'short'})}</span><b className="text-sm">{d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</b></button>)}</div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{courseSlots.map(t=>{const courtFree=freeAt(court,t),coachFree=coachAt(coach,t),free=courtFree&&coachFree,reserved=!!availability&&(availability.blocks||[]).some((b:any)=>b.courtId===court.id&&b.active!==false&&(()=>{const r=span(`${b.start} — ${b.end}`),s=span(t);return !!r&&!!s&&s.start<r.end&&r.start<s.end})()),booked=!!availability&&(availability.bookings||[]).some((b:any)=>b.courtId===court.id&&(()=>{const r=span(b.time),s=span(t);return !!r&&!!s&&s.start<r.end&&r.start<s.end})());return <button key={t} disabled={!free} onClick={()=>{setTime(t);setAvailabilityOpen(false)}} className={`rounded-xl border p-3 text-left text-sm font-bold ${free?'border-emerald-200 bg-emerald-50 hover:border-emerald-500':'border-zawana-950/10 bg-zawana-900 text-zawana-500 opacity-75'}`}><Clock3 size={14} className="mb-1 inline"/> {t}<span className={`mt-1 block text-[10px] font-black uppercase ${free?'text-emerald-700':reserved?'text-red-600':'text-zawana-500'}`}>{!availability?'Loading availability…':free?'Available':reserved?'Reserved':!coachFree?'Coach booked':booked?'Booked':'Unavailable'}</span></button>})}</div><div className="mt-4 flex justify-end"><Button variant="secondary" onClick={()=>setAvailabilityOpen(false)}><CalendarDays size={15}/> Done</Button></div></div></div>}
 </Page>;
}
