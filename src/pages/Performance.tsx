import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, Page, Stat } from '../components/UI';
import { get } from '../api';

type ActivityData={bookings:any[];checkIns:any[];enrollment:any};
const dateLabel=(value:string)=>new Date(`${value}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

export function Performance(){
 const [data,setData]=useState<ActivityData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{get<ActivityData>('/member/dashboard').then(setData).catch((e:any)=>setError(e.message||'Could not load your badminton activity.')).finally(()=>setLoading(false))},[]);
 const bookings=data?.bookings||[],checkIns=data?.checkIns||[];
 const completed=bookings.filter(b=>['completed','COMPLETED'].includes(b.status));
 const privateCourses=bookings.filter(b=>b.kind==='private_course');
 return <Page title="Badminton activity" eyebrow="Your training record" actions={<Link to="/book/court"><Button>Book a court <ArrowRight size={15}/></Button></Link>}>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  {loading?<div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map(n=><Card key={n} className="h-28 bg-zawana-950/5"/>)}</div>:<>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Court bookings" value={bookings.filter(b=>b.kind==='court').length}/><Stat label="Private courses" value={privateCourses.length}/><Stat label="Completed bookings" value={completed.length}/><Stat label="Recent check-ins" value={checkIns.length}/></div>
   <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.8fr]">
    <Card className="p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-zawana-950 text-zawana-gold"><Trophy size={19}/></span><div><p className="text-xs font-black uppercase tracking-widest text-zawana-accent">BADMINTON SESSION LOG</p><h2 className="text-xl font-black">Recent activity</h2></div></div>
     {bookings.length||checkIns.length?<div className="mt-5 divide-y divide-zawana-950/8">{[...bookings.map(b=>({id:`booking-${b.id}`,date:b.date,time:b.time,title:b.title,kind:b.kind==='private_course'?'Private course':'Court rental',status:b.status,location:b.court?.name||b.location})),...checkIns.map(c=>({id:`checkin-${c.id}`,date:c.date,time:c.time,title:c.packageName||'Badminton package',kind:'Package check-in',status:'completed',location:`${c.sessionsUsed||1} session used`}))].sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0,16).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-zawana-500">{item.kind}</p><b>{item.title}</b><p className="mt-1 text-xs text-zawana-500">{dateLabel(item.date)} · {item.time} · {item.location}</p></div><Badge good={['completed','CONFIRMED','confirmed'].includes(item.status)}>{String(item.status).replaceAll('_',' ')}</Badge></div>)}</div>:<div className="mt-5"><Empty title="No badminton activity yet" body="Court bookings, coaching sessions and package check-ins will appear here after your first visit." action={<Link to="/book/court"><Button>Find a court</Button></Link>}/></div>}
    </Card>
    <Card className="h-fit p-6"><p className="text-xs font-black uppercase tracking-widest text-zawana-accent">PACKAGE STATUS</p><h2 className="mt-2 text-xl font-black">{data?.enrollment?.packageName||'No active package'}</h2>{data?.enrollment?<><div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-zawana-500">Sessions remaining</p><b className="text-3xl">{data.enrollment.sessionsRemaining}<span className="text-sm font-normal text-zawana-500"> / {data.enrollment.sessionsTotal}</span></b></div><Badge good>Active</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-zawana-900"><div className="h-full rounded-full bg-zawana-gold" style={{width:`${Math.max(0,Math.min(100,Number(data.enrollment.sessionsRemaining)/Math.max(1,Number(data.enrollment.sessionsTotal))*100))}%`}}/></div><p className="mt-3 flex items-center gap-2 text-xs text-zawana-500"><CalendarDays size={14}/> Expires {dateLabel(data.enrollment.expiryDate)}</p></>:<p className="mt-2 text-sm text-zawana-500">Package and check-in activity appears after you purchase a badminton package.</p>}<Link to="/membership" className="mt-5 inline-flex items-center text-sm font-bold">Explore packages <ArrowRight className="ml-1" size={15}/></Link></Card>
   </div>
   <p className="mt-6 rounded-2xl border border-zawana-950/8 bg-white p-4 text-xs leading-5 text-zawana-500">Performance measurements such as speed, strength and match statistics are not recorded in your account yet. This page shows only booking and package activity stored by Zawana.</p>
  </>}
 </Page>;
}
