import { Check, Clock3, CircleMinus, CircleX, Hourglass } from 'lucide-react';
import './attendance-status.css';

export function AttendanceStatus({status}:{status:'present'|'late'|'absent'|'excused'|'pending'}){
 const Icon={present:Check,late:Clock3,absent:CircleX,excused:CircleMinus,pending:Hourglass}[status];
 const label={present:'Checked in',late:'Late',absent:'Absent',excused:'Excused',pending:'Pending'}[status];
 return <span className={`attendance-status attendance-status--${status}`}><Icon size={13} aria-hidden="true"/>{label}</span>;
}
