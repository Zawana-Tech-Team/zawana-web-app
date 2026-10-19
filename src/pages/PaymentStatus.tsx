import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, CreditCard, XCircle } from 'lucide-react';
import { Button, Card, Page } from '../components/UI';
import { get } from '../api';

export function PaymentStatus() {
  const { id = '' } = useParams();
  const [attempt, setAttempt] = useState<any>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await get<any>(`/payments/${id}`);
        if (active) {
          setAttempt(data);
          setError('')
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Could not load payment status.')
      } finally {
        if (active) setLoading(false)
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (['PENDING', 'INITIATING'].includes(attempt?.status)) void load()
    }, 4000);
    return () => {
      active = false;
      window.clearInterval(timer)
    };
  }, [id, attempt?.status]);

  const paid = attempt?.status === 'SUCCEEDED',
    expired = attempt?.status === 'EXPIRED',
    failed = attempt?.status === 'FAILED';
  const gym = attempt?.resourceType === 'gym_enrollment';
  return <Page title="KPay checkout" eyebrow={gym ? 'Gym package payment' : 'Private course payment'}>
    <Card className="mx-auto max-w-xl p-7 text-center">
      <div
        className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${paid ? 'bg-emerald-100 text-emerald-700' : expired || failed ? 'bg-red-100 text-red-700' : 'bg-zawana-950 text-zawana-gold'}`}
      >
        {paid ? <CheckCircle2 /> : expired || failed ? <XCircle /> : <CreditCard />}
      </div>
      <h2 className="mt-4 text-xl font-black">
        {loading
          ? 'Loading payment…'
          : paid
            ? 'Payment successful'
            : expired
              ? 'Payment window expired'
              : failed
                ? 'Payment was not completed'
                : 'Complete payment with KPay'}
      </h2>
      {error ?
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p> : null}
      {attempt &&
        <div className="mt-5 rounded-xl bg-zawana-900 p-4 text-left text-sm">
          <p className="flex justify-between gap-3">
            <span className="text-zawana-500">Amount</span>
            <b>
              {Number(attempt.amount).toLocaleString()} {attempt.currency || 'MMK'}
            </b>
          </p>
          <p className="mt-2 flex justify-between gap-3">
            <span className="text-zawana-500">Reference</span>
            <b>{attempt.reference}</b>
          </p>
          <p className="mt-2 flex justify-between gap-3">
            <span className="text-zawana-500">Status</span>
            <b>{String(attempt.status).replaceAll('_', ' ')}</b>
          </p>
          <p className="mt-2 flex justify-between gap-3">
            <span className="text-zawana-500">Checkout expires</span>
            <b>{new Date(attempt.expiresAt).toLocaleString()}</b>
          </p>
        </div>}
      {attempt?.qrCode &&
        <div className="mt-5">
          {String(attempt.qrCode).startsWith('data:image') ||
          String(attempt.qrCode).startsWith('http') ?
            <img
              src={attempt.qrCode}
              alt="KPay payment QR code"
              className="mx-auto max-h-64 rounded-xl border p-2"
            /> :
            <p className="break-all rounded-xl bg-zawana-900 p-4 text-xs">{attempt.qrCode}</p>}
        </div>}
      {attempt?.checkoutUrl && !paid &&
        <a
          href={attempt.checkoutUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex"
        >
          <Button>Continue to KPay</Button>
        </a>}
      {!attempt &&
        <p className="mt-3 text-sm leading-6 text-zawana-500">This page checks the verified KPay transaction status. Payments update automatically when KPay confirms them.</p>}
      {attempt?.status === 'PENDING' &&
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-zawana-500">
          <Clock3 size={14} />Waiting for KPay confirmation…</p>}
      {paid &&
        <p className="mt-3 text-sm text-emerald-800">{gym ? 'Your gym package is activated. View your package balance and receipt in My Gym Training.' : 'Your private course is now confirmed. Your member and coach schedules have been updated.'}</p>}
      {expired &&
        <p className="mt-3 text-sm text-zawana-500">{gym ? 'This checkout expired without activation. Ask Gym Front Office to start a new checkout.' : 'The reservation was released when the 24-hour payment window ended.'}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to={gym ? '/member/training' : '/bookings'}>
          <Button>{gym ? 'View gym packages' : paid ? 'View confirmed booking' : 'My bookings'}</Button>
        </Link>
        <Link to="/member">
          <Button variant="secondary">Member dashboard</Button>
        </Link>
      </div>
    </Card>
  </Page>;
}
