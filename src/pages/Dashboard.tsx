import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, MapPin, Package, UserRound } from 'lucide-react';
import { Button, Page, PageSkeleton } from '../components/UI';
import { get } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { useBookingClock } from '../hooks/useBookingClock';
import { bookingStart, normalizeBookingTime } from '../utils/bookingTime';
import { formatBookingDate } from '../utils/bookingDates';
import './member-dashboard.css';
type Booking={id:string;title:string;kind:string;date:string;time:string;location:string;status:string;court?:{name:string}|null;coach?:{name:string}|null};
type Enrollment={id:string;categoryCode:string|null;packageName:string;status:string;startDate:string;expiryDate:string;sessionsRemaining:number;sessionsTotal:number};
type DashboardData={todayBookings:Booking[];upcomingBookings:Booking[];enrollments:Enrollment[];requestCount:number;requestLink:string|null;notifications:{id:string}[]};
const statusLabel=(status:string)=>({confirmed:'Confirmed',pending:'Pending',pending_coach_confirmation:'Awaiting coach',awaiting_payment:'Payment needed'} as Record<string,string>)[status.toLowerCase()]||status.replaceAll('_',' ').toLowerCase();
export function Dashboard(){
 const {user}=useAuth(),{locale}=useLanguage(),clock=useBookingClock(),revision=useBookingRevision();
 const[data,setData]=useState<DashboardData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true;void get<DashboardData>(`/member/dashboard?referenceDate=${clock.date}`).then(data=>{if(live){setData(data);setError('');}}).catch(e=>{if(live)setError(e.message||'Could not load your dashboard.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[clock.date,revision,retry]);
 const dateLabel=(date:string)=>formatBookingDate(date,{weekday:'short',day:'numeric',month:'short'},locale);
 const schedule=[...(data?.todayBookings||[]),...(data?.upcomingBookings||[])].filter(b=>!['cancelled','completed','expired','coach_declined'].includes(b.status.toLowerCase())&&(b.date>clock.date||(b.date===clock.date&&bookingStart(b.time)>clock.minute))).sort((a,b)=>a.date.localeCompare(b.date)||bookingStart(a.time)-bookingStart(b.time));
 const active=(data?.enrollments||[]).filter(e=>e.status==='active'&&e.startDate<=clock.date&&e.expiryDate>=clock.date&&e.sessionsRemaining>0).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
 const next=schedule[0];
 if(loading)return <PageSkeleton/>;
 return <Page title={`Hello, ${user?.name?.split(' ')[0]||'Athlete'}`} eyebrow={dateLabel(clock.date)} showTrail={false}>
 <div className="member-home">
 {error&&<div role="alert" className="member-home-error"><p>{error}</p><Button variant="secondary" onClick={()=>setRetry(v=>v+1)}>Try again</Button></div>}
 {!data&&error?null:<>
 <nav className="member-home-actions" aria-label="Quick actions">{[{to:'/book/court',label:'Book a court',icon:CalendarDays},{to:'/private-course',label:'Private course',icon:UserRound},{to:'/membership',label:'Packages & check-in',icon:Package}].map(({to,label,icon:Icon})=><Link key={to} to={to}><Icon size={20} strokeWidth={1.5}/><span>{label}</span><ArrowRight size={16}/></Link>)}</nav>
 {!!data?.requestCount&&<section className="member-home-attention" aria-label="Needs your attention"><div><span className="member-home-eyebrow">Needs your attention</span><h2>{data.requestCount} booking {data.requestCount===1?'request needs':'requests need'} your reply</h2><p>Choose how you’d like to handle your affected bookings.</p></div><Link to={data.requestLink||'/bookings'}>View requests <ArrowRight size={16}/></Link></section>}
 <div className="member-home-grid"><section className="member-home-panel" aria-label="Upcoming schedule"><header><div><span className="member-home-eyebrow">Your schedule</span><h2>Up next</h2></div><Link to="/bookings">All bookings <ArrowRight size={15}/></Link></header>
 {next?<><article className="member-home-next"><div className="member-home-date"><CalendarDays size={24} strokeWidth={1.4}/><span>{next.date===clock.date?'Today':dateLabel(next.date)}</span></div><div><span className="member-home-eyebrow">{next.kind==='private_course'?'Private course':'Court rental'}</span><h3>{next.title}</h3><p><Clock3 size={15}/>{normalizeBookingTime(next.time)}</p>{((next.court?.name||next.location)!==next.title||next.coach?.name)&&<p><MapPin size={15}/>{next.court?.name||next.location}{next.coach?.name?` · ${next.coach.name}`:''}</p>}<span className="member-home-status">{statusLabel(next.status)}</span></div></article>{schedule.length>1&&<ol className="member-home-schedule">{schedule.slice(1,4).map(b=><li key={b.id}><div><strong>{b.title}</strong><p>{dateLabel(b.date)} · {normalizeBookingTime(b.time)}</p></div><span className="member-home-status">{statusLabel(b.status)}</span></li>)}</ol>}</>:<div className="member-home-empty"><CalendarDays size={32} strokeWidth={1}/><h3>Your next session starts here.</h3><p>Choose a court or private course using the actions above.</p></div>}
 </section>
 <section className="member-home-panel" aria-label="Active packages"><header><div><span className="member-home-eyebrow">Your memberships</span><h2>Package balances</h2></div></header>
 {active.length?<ul className="member-home-packages">{active.slice(0,4).map(e=><li key={e.id}><div className="member-home-balance" role="img" aria-label={`${e.sessionsRemaining} of ${e.sessionsTotal} sessions remaining`}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="4" opacity=".13"/><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.min(100,Math.max(0,e.sessionsRemaining/Math.max(1,e.sessionsTotal)*100))} 100`} transform="rotate(-90 32 32)"/></svg><strong>{e.sessionsRemaining}</strong></div><div><h3>{e.packageName}</h3><p>{e.categoryCode?.replaceAll('_',' ')||'Category under review'} · {e.sessionsRemaining} sessions left</p><p>Expires {dateLabel(e.expiryDate)}</p></div></li>)}</ul>:<div className="member-home-empty"><Package size={32} strokeWidth={1}/><h3>No active package</h3><p>Explore packages to find the right fit for your next session.</p></div>}
 <Link to="/membership" className="member-home-footer-link">{active.length?'Package details & check-in':'Explore packages'} <ArrowRight size={16}/></Link>
 </section></div>
 </>}
 </div></Page>;
}
