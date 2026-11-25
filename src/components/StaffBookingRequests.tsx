import { useOperationalActions } from '../context/OperationalActionsContext';
import { ActionRequiredIndicator } from './operational-actions/OperationalActionUI';
import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, CircleX, ClipboardList, Clock3, Hourglass } from 'lucide-react';
import { AdminRequestToolbar } from './AdminRequestToolbar';
import type { RequestRow } from './BookingRequestWorkflow';
import { Button } from './UI';
import { HistoryPagination } from './member-booking/HistoryPagination';
import { formatBookingDate } from '../utils/bookingDates';
import { normalizeBookingTime } from '../utils/bookingTime';
import { affectedBookingMessage, requestMessage } from '../../backend/src/domain/requestMessages';
import './staff-booking-requests.css';

const needsAction=['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT','REFUND_REQUESTED','REFUND_PROCESSING'];
const shortStatus:Record<string,string>={PENDING_CUSTOMER:'Awaiting customer',ADMIN_HANDLING:'Staff assistance',CUSTOMER_SELECTING:'Awaiting coach',AWAITING_ADDITIONAL_PAYMENT:'Payment required'};
const statuses=['PENDING_CUSTOMER','ACKNOWLEDGED','ADMIN_HANDLING','CUSTOMER_SELECTING','AWAITING_ADDITIONAL_PAYMENT','REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED','REFUND_REJECTED','COMPLETED','CANCELLED','EXPIRED'];
export function StaffBookingRequests({adminTab=false,rows,courts,loaded,loading,error,target,label,onRefresh,onDetails,onArrange,onRefund}:{
 adminTab?:boolean;rows:RequestRow[];courts:{id:string;name:string}[];loaded:boolean;loading:boolean;error:string;target:string|null;
 label:(status:string)=>string;onRefresh:()=>void;onDetails:(id:string)=>void;onArrange:(row:RequestRow)=>void;onRefund:(bookingId:string)=>void;
}){
 const { items: actionItems } = useOperationalActions();
 const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1);
 const groups=new Map<string,RequestRow[]>();
 for(const row of rows){
  const key=row.batchId||row.id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key)!.push(row);
 }
 const matches=(row:RequestRow)=>(!status||(adminTab&&status==='needs-action'?needsAction.includes(row.status):row.status===status))&&(!search.trim()||`${row.booking.user.name} ${row.booking.user.phone||''} ${row.booking.code} ${row.originalCourtName||''} ${row.booking.title}`.toLowerCase().includes(search.trim().toLowerCase()));
 const filtered=[...groups].map(([id,items])=>({id,items:items.filter(matches)})).filter(group=>group.items.length);
 const pages=Math.max(1,Math.ceil(filtered.length/5)),current=Math.min(page,pages);
 const targetIndex=target?filtered.findIndex(group=>group.id===target||group.items.some(item=>item.id===target)):-1;
 useEffect(()=>{setPage(value=>Math.min(value,pages));},[pages]);
 useEffect(()=>{if(targetIndex>=0)setPage(Math.floor(targetIndex/5)+1);},[targetIndex,target]);
 const targetGroup=targetIndex>=0?filtered[targetIndex].id:null;
 useEffect(()=>{if(!targetGroup||Math.floor(targetIndex/5)+1!==current)return;const element=document.getElementById(`request-group-${targetGroup}`);element?.focus();element?.scrollIntoView({block:'start'});},[targetGroup,targetIndex,current]);
 const day=(date:string)=>formatBookingDate(date,{day:'numeric',month:'short',year:'numeric'},'en-GB');
 return <section className={`staff-requests ${adminTab?'admin-request-tab staff-requests--admin':''}`}  aria-label="Reschedule request management" aria-busy={loading}>
  {adminTab?<AdminRequestToolbar search={search} searchLabel="Search reschedule requests" placeholder="Find a customer, booking or court" onSearch={value=>{setSearch(value);setPage(1);}} loading={loading} refreshLabel="Refresh requests" onRefresh={onRefresh} filtered={!!(search||status)} clearLabel="Clear request filters" onClear={()=>{setSearch('');setStatus('');setPage(1);}}>
    <select aria-label="Request status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">All request statuses</option><option value="needs-action">Needs staff action</option>{statuses.map(value=><option key={value} value={value}>{shortStatus[value]||label(value)}</option>)}</select>
  </AdminRequestToolbar>:<>
  <header className="staff-requests-heading"><h2>Requests <span>{rows.length}</span></h2><Button variant="secondary" disabled={loading} onClick={onRefresh}>Refresh requests</Button></header>
  <div className="staff-requests-tools"><input aria-label="Search reschedule requests" placeholder="Search customer, booking or court" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/><select aria-label="Request status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">All request statuses</option>{statuses.map(value=><option key={value} value={value}>{label(value)}</option>)}</select>{(search||status)&&<Button variant="ghost" onClick={()=>{setSearch('');setStatus('');setPage(1);}}>Clear request filters</Button>}</div>
  </>}
  {error&&<div role="alert" className="staff-requests-error"><p>{error}</p><Button variant="secondary" onClick={onRefresh}>Retry requests</Button></div>}
  {!loaded?<p role="status" className="staff-requests-empty">Loading requests…</p>:!filtered.length&&!error?<div className="staff-requests-empty">{adminTab&&<ClipboardList size={28} strokeWidth={1.4} aria-hidden="true"/>}<h3>{search||status?'No matching requests':'No requests yet'}</h3><p>{search||status?'Clear or adjust your filters to see more requests.':'New affected-booking requests will appear here.'}</p></div>:<div className="staff-requests-groups">{filtered.slice((current-1)*5,current*5).map(({id,items})=>{
   const names=[...new Set(items.map(item=>item.booking.user.name))],reason=items[0].batch?.reason||items[0].reason;
   return <section id={`request-group-${id}`} key={id} tabIndex={-1} className="staff-request-group" aria-label={`Request group: ${items.length} bookings`}>
    <header><div className={adminTab?'admin-request-group-customer':undefined}>{adminTab&&<span className="admin-request-avatar" aria-hidden="true">{names.length===1?names[0].trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('')||'?':<ClipboardList size={17}/>}</span>}<h3>{names.length===1?names[0]:'Affected bookings'}</h3></div>{(!adminTab||items.length>1)&&<span>{items.length} {items.length===1?'request':'requests'}</span>}</header>
    <ul>{items.map(row=>{
     const court=row.originalCourtName||courts.find(court=>court.id===row.oldSchedule.courtId)?.name||row.booking.court?.name;
     const title=row.kind==='court'?court||row.booking.title:row.booking.title;
     const complete=['ACKNOWLEDGED','REFUNDED','COMPLETED'].includes(row.status);
     const attention=needsAction.includes(row.status);
     const StatusIcon=complete?CheckCircle2:adminTab&&['CANCELLED','EXPIRED','REFUND_REJECTED'].includes(row.status)?CircleX:attention?Clock3:Hourglass;
     return <li key={row.id} aria-label={`Affected booking ${row.booking.code}`}>
      <div className="staff-request-booking"><strong>{title}</strong>{adminTab&&<small className="admin-request-kind">{row.kind==='court'?'Court rental':'Private course'}</small>}{names.length>1&&<p>{row.booking.user.name}</p>}{row.kind!=='court'&&court&&court!==title&&<p>{court}</p>}</div>
      <div className="staff-request-session"><p><CalendarDays size={15} aria-hidden="true"/>{day(row.oldSchedule.date)}</p><p><Clock3 size={14} aria-hidden="true"/>{normalizeBookingTime(row.oldSchedule.time)}</p></div>
      {actionItems.some(item=>item.bookingId===row.bookingId&&item.requestId===row.id)?<ActionRequiredIndicator bookingId={row.bookingId} requestId={row.id}/>:<span className="booking-history-status" title={adminTab?label(row.status):undefined} data-tone={complete?'success':attention?'attention':row.status==='PENDING_CUSTOMER'?'pending':'muted'}><StatusIcon size={14} aria-hidden="true"/>{adminTab?shortStatus[row.status]||label(row.status):label(row.status)}</span>}
      <div className="staff-request-actions"><Button variant="secondary" onClick={()=>onDetails(row.id)}>View Details{adminTab&&<ChevronRight size={14} aria-hidden="true"/>}</Button>{row.kind==='court'&&['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(row.status)&&<Button onClick={()=>onArrange(row)}>Arrange replacement</Button>}{['REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED'].includes(row.status)&&<Button variant={adminTab&&row.status!=='REFUNDED'?'primary':'secondary'} onClick={()=>onRefund(row.bookingId)}>{row.status==='REFUNDED'?'View refund':'Process refund'}</Button>}</div>
     </li>;
    })}</ul>
    {reason&&reason!=='Member self-reschedule'&&<details className="staff-request-notice"><summary>Booking notice</summary><p>{items[0].batchId?affectedBookingMessage(reason):requestMessage(reason)}</p></details>}
   </section>;
  })}</div>}
  {loaded&&!error&&<HistoryPagination page={current} totalPages={pages} total={filtered.length} pageSize={5} noun={filtered.length===1?'group':'groups'} label="Staff request pagination" disabled={loading} onPage={setPage}/>}
 </section>;
}
