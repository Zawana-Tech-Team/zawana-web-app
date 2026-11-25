import { CheckCircle2, CheckCheck, CircleX, Clock3, Hourglass } from 'lucide-react';
import './booking-status.css';

export const bookingStatusLabel=(status:string)=>({active:'Active',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',canceled:'Cancelled',coach_declined:'Coach declined',expired:'Expired',pending:'Pending',pending_coach_confirmation:'Awaiting coach',awaiting_payment:'Payment required'} as Record<string,string>)[status.toLowerCase()]||status.replaceAll('_',' ');

export function BookingStatusBadge({status}:{status:string}) {
 const state=status.toLowerCase();
 const cancelled=['cancelled','canceled','coach_declined'].includes(state);
 const completed=state==='completed',confirmed=state==='confirmed'||state==='active',expired=state==='expired';
 const tone=completed?'completed':confirmed?'confirmed':cancelled?'cancelled':expired?'expired':'pending';
 const Icon=completed?CheckCheck:confirmed?CheckCircle2:cancelled?CircleX:expired?Clock3:Hourglass;

 return <span className="booking-status-badge" data-status={tone}><Icon size={15} strokeWidth={1.8} aria-hidden="true"/>{bookingStatusLabel(status)}</span>;
}
