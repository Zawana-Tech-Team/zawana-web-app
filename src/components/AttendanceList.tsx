import { categoryLabel } from './BadmintonCategoryField';
import { ArrowUpRight, CalendarDays, ListFilter, RefreshCw } from 'lucide-react';
import { AttendanceStatus } from './AttendanceStatus';
import type { AttendanceRow } from './AttendanceDetail';

type Props={records:AttendanceRow[];loading:boolean;error:string;filtered:boolean;onView:(record:AttendanceRow)=>void};
const dateLabel=(date:string)=>new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB',{timeZone:'Asia/Yangon',day:'numeric',month:'short',year:'numeric'});
const sessionTitle=(record:AttendanceRow)=>record.package?.name||record.title;
const sessionNote=(record:AttendanceRow)=>categoryLabel(record.categoryCode);

export function AttendanceList({records,loading,error,filtered,onView}:Props){
 return <section className="attendance-list-panel" aria-label="Filtered attendance list" aria-busy={loading}>
  <header className="attendance-list-heading"><div><h2>Attendance list<span>{loading?'—':records.length}</span></h2>{filtered&&<p className="attendance-list-period">Filtered results</p>}</div></header>
  {loading?<div className="attendance-list-loading" role="status"><span className="sr-only">Loading attendance records…</span>{[0,1,2].map(row=><div className="attendance-list-skeleton" key={row} aria-hidden="true"><i/><div><span/><span/></div><span/></div>)}</div>
   :error?<div className="attendance-list-empty"><RefreshCw size={25} aria-hidden="true"/><h3>Unable to load attendance</h3><p>Use Retry above to refresh the records.</p></div>
   :!records.length?<div className="attendance-list-empty"><ListFilter size={27} strokeWidth={1.25} aria-hidden="true"/><h3>{filtered?'No matching records':'No attendance yet'}</h3><p>{filtered?'Try another name, status or date range.':'Recorded package check-ins will appear here.'}</p></div>
   :<>
    <div className="attendance-list-desktop"><table className="attendance-list-table"><caption className="sr-only">Participant, session, date and time, attendance status and details</caption><thead><tr>{['Participant','Session','Date & time','Status',''].map((heading,index)=><th scope="col" key={heading||index}>{heading||<span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody>{records.map(record=><tr key={`${record.kind}-${record.id}`}>
     <td><div className="attendance-list-person"><Avatar record={record}/><p className="attendance-list-name">{record.name}</p></div></td>
     <td><p className="attendance-list-primary">{sessionTitle(record)}</p><p className="attendance-list-secondary">{sessionNote(record)}</p>{record.package&&<Sessions record={record}/>}</td>
     <td className="attendance-list-date"><p className="attendance-list-primary">{dateLabel(record.date)}</p><p className="attendance-list-secondary">{record.time}</p></td>
     <td><AttendanceStatus status={record.status}/></td>
     <td><Details record={record} onView={onView}/></td>
    </tr>)}</tbody></table></div>
    <div className="attendance-list-mobile">{records.map(record=><article className="attendance-list-card" key={`${record.kind}-${record.id}`}>
     <div className="attendance-list-card-head"><div className="attendance-list-person"><Avatar record={record}/><p className="attendance-list-name">{record.name}</p></div><AttendanceStatus status={record.status}/></div>
     <div className="attendance-list-card-session"><p className="attendance-list-primary">{sessionTitle(record)}</p><p className="attendance-list-secondary">{sessionNote(record)}</p></div>
     <p className="attendance-list-card-date"><CalendarDays size={14} aria-hidden="true"/>{dateLabel(record.date)}<span>·</span>{record.time}</p>
     {record.package&&<Sessions record={record}/>}<footer><Details record={record} onView={onView}/></footer>
    </article>)}</div>
   </>}
 </section>;
}
function Avatar({record}:{record:AttendanceRow}){
 const initials=record.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
 return <span className="attendance-list-avatar" aria-hidden="true">{record.avatar?<img src={record.avatar} alt=""/>:initials}</span>;
}
function Details({record,onView}:{record:AttendanceRow;onView:Props['onView']}){
 return <button className="attendance-list-action" aria-label={`View attendance details for ${record.name}`} onClick={()=>onView(record)}>Details<ArrowUpRight size={14} aria-hidden="true"/></button>;
}
function Sessions({record}:{record:AttendanceRow}){
 const pkg=record.package;if(!pkg)return null;
 return <div className={`attendance-list-sessions ${pkg.remaining<=2?'is-low':''}`}><span>{pkg.remaining} sessions left</span><progress aria-label={`Sessions remaining for ${record.name}`} value={Math.min(Math.max(pkg.remaining,0),Math.max(pkg.total,1))} max={Math.max(pkg.total,1)}/></div>;
}
