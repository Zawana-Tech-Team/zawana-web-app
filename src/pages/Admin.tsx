import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, ClipboardList, Clock3, RotateCcw, Users } from 'lucide-react';
import { Button, Page } from '../components/UI';
import { BookingStatusBadge } from '../components/BookingStatusBadge';
import { useLanguage } from '../context/LanguageContext';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { usePaymentRevision } from '../hooks/usePaymentRevision';
import { useBookingClock } from '../hooks/useBookingClock';
import { normalizeBookingTime } from '../utils/bookingTime';
import { formatBookingDate } from '../utils/bookingDates';
import { get } from '../api';
import './admin-dashboard.css';

type AdminData={date:string;metrics:{revenueToday:number;bookingsToday:number;activeMembers:number};attention:{id:string;label:string;count:number;href:string}[];schedule:{id:string;code:string;kind:string;title:string;date:string;time:string;status:string;customer:string;court:string|null;floor:string|null;coach:string|null;href:string}[]};
export function Admin(){
 const {locale}=useLanguage(),clock=useBookingClock(),revision=useBookingRevision(),paymentRevision=usePaymentRevision();
 const [data,setData]=useState<AdminData|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
 useEffect(()=>{let live=true;setRefreshing(true);void get<AdminData>('/admin/dashboard').then(result=>{if(live){setData(result);setError('');}}).catch(failure=>{if(live)setError(failure instanceof Error?failure.message:'Could not load the dashboard.');}).finally(()=>{if(live){setLoading(false);setRefreshing(false);}});return()=>{live=false;};},[clock.date,revision,paymentRevision,retry]);
 const date=formatBookingDate(data?.date||clock.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'},locale);
 return <Page title="Admin overview" eyebrow={date} showTrail={false} actions={<Link className="admin-home-primary" to="/admin/court-rentals"><CalendarDays size={16} aria-hidden="true"/>Open court desk<ArrowUpRight size={15} aria-hidden="true"/></Link>}><div className="admin-home">
  {error&&<div role="alert" className="admin-home-error"><p>{data?'The overview could not refresh. Previously loaded figures are shown. ':''}{error}</p><Button variant="secondary" loading={refreshing} onClick={()=>setRetry(value=>value+1)}>Retry</Button></div>}
  {loading?<div role="status" className="admin-home-loading"><span className="sr-only">Loading admin overview…</span>{[0,1,2].map(item=><div key={item} aria-hidden="true"/>)}</div>:data&&<>
   <section className="admin-home-metrics" aria-label="Key figures">
    <article><header><span>Today’s net revenue</span><Banknote size={19} strokeWidth={1.5} aria-hidden="true"/></header><p><strong>{data.metrics.revenueToday.toLocaleString(locale)}</strong><small>MMK</small></p><Link to="/admin/finance">View finance<ArrowRight size={14} aria-hidden="true"/></Link></article>
    <article><header><span>Bookings today</span><CalendarDays size={19} strokeWidth={1.5} aria-hidden="true"/></header><p><strong>{data.metrics.bookingsToday.toLocaleString(locale)}</strong></p><span className="admin-home-metric-note">Court rental & private courses</span></article>
    <article><header><span>Active members</span><Users size={19} strokeWidth={1.5} aria-hidden="true"/></header><p><strong>{data.metrics.activeMembers.toLocaleString(locale)}</strong></p><Link to="/admin/users">Manage users<ArrowRight size={14} aria-hidden="true"/></Link></article>
   </section>
   <div className="admin-home-panels">
    <section className="admin-home-panel" aria-label="Today's schedule"><header><h2>Today’s schedule</h2><Link to="/admin/court-rentals?history=1">View bookings<ArrowRight size={14} aria-hidden="true"/></Link></header>
     {data.schedule.length?<ul className="admin-home-schedule">{data.schedule.map(row=><li key={row.id}><Link to={row.href}><div className="admin-home-session-time"><Clock3 size={15} aria-hidden="true"/><span>{normalizeBookingTime(row.time)}</span></div><div className="admin-home-session-main"><p>{row.kind==='private_course'?'Private course':row.kind==='class'?'Weekly class':'Court rental'}</p><h3>{row.title}{row.kind==='court'&&row.floor?` (${row.floor})`:''}</h3><span>{row.customer}{row.kind!=='court'&&row.court?` · ${row.court}`:''}{row.coach?` · ${row.coach}`:''}</span></div><BookingStatusBadge status={row.status}/><ArrowUpRight className="admin-home-session-arrow" size={16} aria-hidden="true"/></Link></li>)}</ul>:<div className="admin-home-empty"><CalendarDays size={30} strokeWidth={1.3} aria-hidden="true"/><h3>No more sessions today</h3><p>Upcoming and past reservations are available in Booking History.</p></div>}
    </section>
    <section className="admin-home-panel" aria-label="Needs attention"><header><h2>Needs attention</h2></header>{data.attention.length?<ul className="admin-home-attention">{data.attention.map(item=><li key={item.id}><Link to={item.href}><span className="admin-home-attention-icon">{item.id==='refunds'?<RotateCcw size={18} aria-hidden="true"/>:<ClipboardList size={18} aria-hidden="true"/>}</span><span>{item.label}</span><strong>{item.count.toLocaleString(locale)}</strong><ArrowRight size={16} aria-hidden="true"/></Link></li>)}</ul>:<div className="admin-home-empty admin-home-empty--clear"><CheckCircle2 size={30} strokeWidth={1.3} aria-hidden="true"/><h3>Nothing needs your review</h3><p>Admin assistance and refund reviews will appear here.</p></div>}</section>
   </div>
  </>}
 </div></Page>;
}
