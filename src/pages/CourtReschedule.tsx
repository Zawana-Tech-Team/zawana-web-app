import { DeskMoveDialog, type MoveSource } from '../components/court-desk/DeskMoveDialog';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Page } from '../components/UI';
import { SharedRescheduleFlow } from '../components/SharedRescheduleFlow';
import { useAuth } from '../context/AuthContext';
import { get } from '../api';
import { courtBookingsPath, courtBookingCustomer, type CourtChangeDetail } from '../types/courtChanges';

export default function CourtReschedule() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [params]=useSearchParams();const requestId=params.get('request')||undefined;
  if (user?.role === 'admin' || user?.role === 'badminton_fo') return <StaffRescheduleEntry bookingId={id} />;
  return <RescheduleFlow key={`${id}:${requestId||''}`} bookingId={id} requestId={requestId} />;
}

function RescheduleFlow({bookingId,requestId}:{bookingId:string;requestId?:string}){
 const navigate=useNavigate();
 const back=()=>navigate('/bookings');
 return <SharedRescheduleFlow bookingId={bookingId} requestId={requestId} onClose={back}/>;
}

function StaffRescheduleEntry({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [source, setSource] = useState<MoveSource | null>(null), [courts, setCourts] = useState<{ id: string; name: string }[]>([]), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setSource(null); setError('');
    void Promise.all([get<CourtChangeDetail & { booking: CourtChangeDetail['booking'] & { courtId: string } }>(`/court-booking/bookings/${encodeURIComponent(bookingId)}/changes`), get<typeof courts>('/courts')])
      .then(([data, courts]) => { if (live) { setSource({ id: data.booking.id, kind: 'court', date: data.booking.date, time: data.booking.time, courtId: data.booking.courtId, title: data.booking.title, customerName: courtBookingCustomer(data) }); setCourts(courts); } })
      .catch(e => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [bookingId, reload]);
  const back = () => navigate(courtBookingsPath(user?.role));
  return <Page title="Court rentals" eyebrow="Badminton desk" actions={<Button variant="secondary" onClick={back}>Back to bookings</Button>}>
    {loading && <p role="status" className="rental-change-loading">Loading reservation…</p>}
    {error && <div role="alert" className="rental-change-error"><p>{error}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Retry reservation</Button></div>}
    {source && <DeskMoveDialog key={source.id} sources={[source]} courts={courts} onClose={back} onChanged={async () => { back(); }} />}
  </Page>;
}
