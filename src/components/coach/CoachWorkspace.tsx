import { useOperationalActions } from '../../context/OperationalActionsContext';
import { ActionRequiredIndicator, PendingActionCounter } from '../operational-actions/OperationalActionUI';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, ArrowUpRight, Users } from 'lucide-react';
import { get } from '../../api';
import { useBookingRevision } from '../../hooks/useBookingRevision';
import { bookingClock, bookingStart } from '../../utils/bookingTime';
import { shiftDateKey } from '../../utils/bookingDates';
import { Button, Card } from '../UI';
import { BookingStatusBadge } from '../BookingStatusBadge';
import './coach-workspace.css';

type Session={id:string;title:string;date:string;time:string;status:string;user?:{name:string};court?:{name:string};location:string};
type Data={sessions:Session[];pending:number;proposals:number};
export function CoachWorkspace(){
 const { counts, items } = useOperationalActions();
 const revision=useBookingRevision(),date=bookingClock().date;
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let live=true;
  void Promise.all([get<{bookings:Session[]}>(`/coach/calendar?start=${date}&end=${shiftDateKey(date,7)}`),Promise.resolve(null),Promise.resolve(null)]).then(([calendar])=>{
   if(live){setData({sessions:[...calendar.bookings].sort((a,b)=>a.date.localeCompare(b.date)||bookingStart(a.time)-bookingStart(b.time)),pending:0,proposals:0});setError('');}
  }).catch(()=>{if(live)setError('Your schedule could not refresh. Check your connection and retry.');});
  return()=>{live=false;};
 },[revision,date,retry]);
 const sessions=data?.sessions||[],today=sessions.filter(row=>row.date===date),upcoming=sessions.filter(row=>row.date>date&&row.status==='CONFIRMED').slice(0,5);
 const list=(items:Session[])=>items.map(row=><li key={row.id} className="coach-session"><div><strong>{row.time}</strong><p>{row.user?.name||'Member'} · {row.title}</p><small>{row.date} · {row.court?.name||row.location}</small></div><span><BookingStatusBadge status={row.status}/><ActionRequiredIndicator bookingId={row.id}/></span></li>);
 return <div className="coach-workspace">
  {error&&<p role="alert" className="coach-workspace-error">{error}<Button variant="secondary" onClick={()=>setRetry(value=>value+1)}>Retry</Button></p>}
  {!data&&!error&&<p role="status">Loading your schedule and requests…</p>}
  <Card className="coach-workspace-today"><header><div><p className="coach-workspace-eyebrow">Your next priority</p><h2>Today’s schedule</h2></div><Link to="/coach/schedule">Open calendar <ArrowUpRight size={16} aria-hidden="true"/></Link></header>
   {data&&(today.length?<ul>{list(today)}</ul>:<p className="coach-workspace-empty">No sessions today. Your upcoming sessions appear below.</p>)}
  </Card>
  <section className="coach-workspace-requests" aria-label="Pending coaching requests"><div><ClipboardList size={23} strokeWidth={1.5} aria-hidden="true"/><div><h2>Pending requests<PendingActionCounter count={counts.coachRequests} label="Coach requests"/></h2><p>{data?`${items.filter(item=>item.action==='coach-booking').length} new ${items.filter(item=>item.action==='coach-booking').length===1?'booking':'bookings'} · ${items.filter(item=>item.action==='coach-proposal').length} replacement ${items.filter(item=>item.action==='coach-proposal').length===1?'proposal':'proposals'}`:'Checking requests…'}</p></div></div><div><Link to="/coach/bookings?status=PENDING_COACH_CONFIRMATION"><Button>Review booking requests</Button></Link><Link to="/coach/bookings"><Button variant="secondary">View replacement proposals</Button></Link></div></section>
  <Card className="coach-workspace-upcoming"><header><h2>Next seven days</h2><CalendarDays size={21} strokeWidth={1.5} aria-hidden="true"/></header>{data&&(upcoming.length?<ul>{list(upcoming)}</ul>:<p className="coach-workspace-empty">No upcoming confirmed sessions. Approved bookings will appear here.</p>)}</Card>
  <nav className="coach-workspace-links" aria-label="Coach shortcuts"><Link to="/coach/clients"><Users size={18} aria-hidden="true"/>Your customers</Link><Link to="/coach/notifications">Notifications</Link></nav>
 </div>;
}
