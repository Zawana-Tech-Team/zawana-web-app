import { useEffect, useState, type KeyboardEvent } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, RefreshCw } from 'lucide-react';
import { get } from '../../api';
import { bookingClock } from '../../utils/bookingTime';
import { categoryLabel } from '../BadmintonCategoryField';
import type { AttendanceRow } from '../AttendanceDetail';
import './member-attendance.css';

const monthLabel=(month:string)=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'Asia/Yangon'}).format(new Date(`${month}-01T12:00:00Z`));
const dateLabel=(date:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Yangon'}).format(new Date(`${date}T12:00:00Z`));
export function MemberAttendanceHistory(){
 const today=bookingClock().date,currentMonth=today.slice(0,7);
 const [selected,setSelected]=useState(today);
 const [month,setMonth]=useState(currentMonth),[rows,setRows]=useState<AttendanceRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let live=true;setLoading(true);setError('');
  void get<{records:AttendanceRow[]}>(`/attendance?${new URLSearchParams({month})}`).then(data=>{if(live){const visits=data.records.filter(row=>['present','late'].includes(row.status)).sort((a,b)=>b.date.localeCompare(a.date)||(b.checkedInAt||'').localeCompare(a.checkedInAt||''));setRows(visits);setSelected(current=>current.startsWith(month)?current:visits[0]?.date||`${month}-01`);}}).catch(()=>{if(live)setError('Your check-in history could not refresh. Please try again.');}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[month,revision]);
 useEffect(()=>{const refresh=()=>{if(!document.hidden)setRevision(value=>value+1);};window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[]);
 const changeMonth=(next:string)=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(next)||next>currentMonth)return;setRows([]);setSelected(next===currentMonth?today:'');setMonth(next);};
 const move=(amount:number)=>{const date=new Date(`${month}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+amount);changeMonth(date.toISOString().slice(0,7));};
 const first=new Date(`${month}-01T12:00:00Z`),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const selectedDate=selected||`${month}-01`,dayRows=rows.filter(row=>row.date===selectedDate);
 const keyboardDay=(event:KeyboardEvent<HTMLButtonElement>,date:string)=>{
  const value=Number(date.slice(-2)),weekday=(new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7;
  const next=event.key==='ArrowRight'?value+1:event.key==='ArrowLeft'?value-1:event.key==='ArrowDown'?value+7:event.key==='ArrowUp'?value-7:event.key==='Home'?value-weekday:event.key==='End'?value+6-weekday:null;
  if(next===null)return;event.preventDefault();if(next<1||next>days)return;const target=`${month}-${String(next).padStart(2,'0')}`;if(target>today)return;setSelected(target);document.getElementById(`visit-day-${target}`)?.focus();
 };
 return <main className="member-attendance">
  <header><div><p className="member-attendance-eyebrow">Your activity</p><h1>Check-in history</h1></div><button type="button" className="member-attendance-refresh" aria-label="Refresh check-in history" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={17} className={loading?'animate-spin':''} aria-hidden="true"/><span>Refresh</span></button></header>
  <section className="member-attendance-history" aria-label="Your check-ins" aria-busy={loading}>
   <div className="member-attendance-period"><div><h2 className="sr-only">{monthLabel(month)}</h2><p aria-live="polite">{loading?'Loading visits…':`${rows.length} ${rows.length===1?'check-in':'check-ins'}`}</p></div><div className="member-attendance-month"><button type="button" aria-label="Previous month" onClick={()=>move(-1)}><ChevronLeft size={18} aria-hidden="true"/></button><label><span className="sr-only">View month</span><input aria-label="View month" type="month" value={month} max={currentMonth} onChange={event=>changeMonth(event.target.value)}/></label><button type="button" aria-label="Next month" disabled={month>=currentMonth} onClick={()=>move(1)}><ChevronRight size={18} aria-hidden="true"/></button></div></div>
   {error&&<p role="alert" className="member-attendance-error">{error}<button type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Retry</button></p>}
   <div className="member-attendance-calendar-layout">
    <section className="member-attendance-calendar" aria-label="Attendance calendar">
     <div className="member-attendance-weekdays" aria-hidden="true">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><span key={day}>{day}</span>)}</div>
     <div className="member-attendance-days">{Array.from({length:offset},(_,index)=><span key={`blank-${index}`} aria-hidden="true"/>)}{Array.from({length:days},(_,index)=>{
      const date=`${month}-${String(index+1).padStart(2,'0')}`,count=rows.filter(row=>row.date===date).length;
      return <button type="button" id={`visit-day-${date}`} key={date} disabled={date>today} tabIndex={date===selectedDate?0:-1} className={`${date===selectedDate?'is-selected ':''}${date===today?'is-today ':''}${count?'has-visits':''}`} aria-label={`${dateLabel(date)}, ${count} ${count===1?'check-in':'check-ins'}`} aria-pressed={date===selectedDate} aria-current={date===today?'date':undefined} onClick={()=>setSelected(date)} onKeyDown={event=>keyboardDay(event,date)}><span>{index+1}</span>{count>0&&<small aria-hidden="true">{count===1?'•':count}</small>}</button>;
     })}</div><p className="member-attendance-calendar-key"><span aria-hidden="true"/>Recorded check-in</p>
    </section>
    <section className="member-attendance-day-detail" aria-label="Selected day check-ins"><header><h2>{dateLabel(selectedDate)}</h2></header>
   {loading&&!rows.length?<div className="member-attendance-loading" role="status"><span className="sr-only">Loading check-in history…</span>{[0,1,2].map(item=><div key={item} aria-hidden="true"/>)}</div>:dayRows.length?<ul>{dayRows.map(row=><li key={`${row.kind}-${row.id}`} className="member-attendance-visit"><span className="member-attendance-icon" aria-hidden="true"><Check size={20} strokeWidth={1.6}/></span><div><h3>{row.package?.name||row.title}</h3><p>{categoryLabel(row.categoryCode)}</p><p className="member-attendance-time"><Clock3 size={13} aria-hidden="true"/>{row.time||'Time not recorded'}</p></div><span className="member-attendance-state">Checked in</span></li>)}</ul>:!error&&<div className="member-attendance-empty"><CalendarDays size={30} strokeWidth={1.3} aria-hidden="true"/><h3>{rows.length?'No check-ins this day':'No check-ins this month'}</h3><p>{rows.length?'Choose a marked date to view your visits.':'Choose another month to look back at your visits.'}</p></div>}
    </section>
   </div>
  </section><p className="member-attendance-note">Times shown in Yangon.</p>
 </main>;
}
