import { useRef, useState } from 'react';
import { post } from '../../api';
import { Button } from '../UI';
import { DeskDialog } from '../court-desk/DeskDialog';

export function CoachBookingDecision({bookingId,onChanged}:{bookingId:string;onChanged:()=>Promise<unknown>}){
 const [choice,setChoice]=useState<'accept'|'decline'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const confirm=async()=>{if(!choice||lock.current)return;lock.current=true;setBusy(true);setError('');try{await post(`/coach/private-courses/${bookingId}/decision`,{decision:choice});setChoice(null);await onChanged();}catch{setError('Could not update this request. Refresh the booking before retrying.');}finally{lock.current=false;setBusy(false);}};
 return <><div className="flex flex-wrap gap-2"><Button onClick={()=>setChoice('accept')}>Accept booking</Button><Button variant="secondary" onClick={()=>setChoice('decline')}>Decline booking</Button></div>{error&&!choice&&<p role="alert">{error}</p>}{choice&&<DeskDialog title={choice==='accept'?'Accept this booking?':'Decline this booking?'} size="compact" busy={busy} onClose={()=>setChoice(null)} actions={<Button variant={choice==='accept'?'primary':'danger'} loading={busy} disabled={busy} onClick={()=>void confirm()}>{choice==='accept'?'Confirm acceptance':'Confirm decline'}</Button>}><p>{choice==='accept'?'Approve this assigned session. Existing payment and reservation rules still apply.':'Decline this assigned session and release its reservation. Payment records remain available for staff review.'}</p>{error&&<p role="alert">{error}</p>}</DeskDialog>}</>;
}
