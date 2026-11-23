import { DeskMoveDialog, type MoveSource } from '../components/court-desk/DeskMoveDialog';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Page } from '../components/UI';
import { SharedRescheduleFlow } from '../components/SharedRescheduleFlow';
import { useAuth } from '../context/AuthContext';
import { get } from '../api';
import { courtBookingsPath, type CourtChangeDetail } from '../types/courtChanges';

export default function CourtReschedule() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  if (user?.role === 'admin' || user?.role === 'badminton_fo') return <StaffRescheduleEntry bookingId={id} />;
  return <RescheduleFlow key={id} bookingId={id} />;
}

function RescheduleFlow({bookingId}:{bookingId:string}){
 const navigate=useNavigate();
 const back=()=>navigate('/bookings');
 return <Page title="Reschedule your booking" eyebrow="Zawana Badminton Arena"><SharedRescheduleFlow bookingId={bookingId} onClose={back} onChanged={()=>{}}/></Page>;
}

function StaffRescheduleEntry({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [source, setSource] = useState<MoveSource | null>(null), [courts, setCourts] = useState<{ id: string; name: string }[]>([]), [error, setError] = useState('');
  useEffect(() => { let live = true; void Promise.all([get<{ booking: CourtChangeDetail['booking'] & { courtId: string } }>(`/court-booking/bookings/${encodeURIComponent(bookingId)}/changes`), get<typeof courts>('/courts')]).then(([data, courts]) => { if (live) { setSource({ id: data.booking.id, kind: 'court', date: data.booking.date, time: data.booking.time, courtId: data.booking.courtId, title: data.booking.title }); setCourts(courts); } }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [bookingId]);
  const back = () => navigate(courtBookingsPath(user?.role));
  return <Page title="Reschedule court rental" eyebrow="Badminton desk"><Button variant="secondary" onClick={back}>Back to bookings</Button>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{source && <DeskMoveDialog sources={[source]} courts={courts} onClose={back} onChanged={async () => { back(); }} />}</Page>;
}
