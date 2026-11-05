import { providerPaymentUrl, type PaymentAttempt } from '../services/paymentFlow';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, CreditCard, XCircle } from 'lucide-react';
import { Button, Card, Page } from '../components/UI';
import { get } from '../api';

export function PaymentStatus({ home = '/member' }: { home?: string }) {
  const { id = '' } = useParams();
  const member = home === '/member';
  const [attempt, setAttempt] = useState<(PaymentAttempt & { resourceType: string; amount: number; currency: string; reference: string; expiresAt: string }) | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAttempt(null);
    let pending = true;
    let loadingStatus = false;
    const load = async () => {
      if (loadingStatus) return;
      loadingStatus = true;
      try {
        const data = await get<any>(`/payments/${id}`);
        if (active) {
          pending = ['PENDING', 'INITIATING'].includes(data.status);
          setAttempt(data);
          setError('')
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Could not load payment status.')
      } finally {
        loadingStatus = false;
        if (active) setLoading(false)
      }
    };
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => {
      if (pending) void load()
    }, 4000);
    return () => {
      active = false;
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer)
    };
  }, [id]);

  const paid = attempt?.status === 'SUCCEEDED',
    expired = attempt?.status === 'EXPIRED',
    failed = attempt?.status === 'FAILED',
    cancelled = attempt?.status === 'CANCELLED',
    payable = !!attempt && ['PENDING', 'INITIATING'].includes(attempt.status);
  let paymentUrl: string | null = null;
  try { if (attempt) paymentUrl = providerPaymentUrl(attempt); } catch { /* Never render an unsafe provider URL. */ }
  const gym = attempt?.resourceType === 'gym_enrollment';
  return <Page title="Payment status" eyebrow={gym ? 'Gym package payment' : 'Payment verification'}>
    <Card className="mx-auto max-w-xl p-7 text-center">
      <div
        className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${paid ? 'bg-emerald-100 text-emerald-700' : expired || failed || cancelled ? 'bg-red-100 text-red-700' : 'bg-zawana-950 text-zawana-gold'}`}
      >
        {paid ? <CheckCircle2 /> : expired || failed || cancelled ? <XCircle /> : <CreditCard />}
      </div>
      <h2 aria-live="polite" className="mt-4 text-xl font-black">
        {loading
          ? 'Loading payment…'
          : paid
            ? 'Payment successful'
            : expired
              ? 'Payment window expired'
              : cancelled
                ? 'Payment cancelled'
              : failed
                ? 'Payment was not completed'
                : payable && attempt?.qrCode && !paymentUrl ? 'Scan to pay with KBZPay' : 'Awaiting payment verification'}
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
            <span className="text-zawana-500">Payment expires</span>
            <b>{new Date(attempt.expiresAt).toLocaleString()}</b>
          </p>
        </div>}
      {payable && attempt?.qrCode && !paymentUrl &&
        <div className="mt-5">
          {/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(attempt.qrCode) ?
            <img
              src={attempt.qrCode}
              alt="KPay payment QR code"
              className="mx-auto max-h-64 rounded-xl border p-2"
            /> :
            <p className="break-all rounded-xl bg-zawana-900 p-4 text-xs">{attempt.qrCode}</p>}
        </div>}
      {paymentUrl && payable &&
        <a
          href={paymentUrl}
          rel="noreferrer"
          className="mt-5 inline-flex"
        >
          Resume payment with KBZPay
        </a>}
      {!attempt &&
        <p className="mt-3 text-sm leading-6 text-zawana-500">This page checks the verified KPay transaction status. Payments update automatically when KPay confirms them.</p>}
      {payable &&
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-zawana-500">
          <Clock3 size={14} />Waiting for KPay confirmation…</p>}
      {paid &&
        <p className="mt-3 text-sm text-emerald-800">{gym ? 'Your gym package is activated. View your package balance and receipt in My Gym Training.' : 'Your payment has been verified and the associated booking or package has been updated.'}</p>}
      {expired &&
        <p className="mt-3 text-sm text-zawana-500">{gym ? 'This payment expired without activation. Ask Gym Front Office to start a new payment.' : 'The reservation was released when the 24-hour payment window ended.'}</p>}
      {(failed || cancelled) && <p className="mt-3 text-sm text-zawana-500">No service was activated by this payment. Return to your booking or package to retry.</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to={member ? (gym ? '/member/training' : '/bookings') : home}>
          <Button>{!member ? 'Back to dashboard' : gym ? 'View gym packages' : paid ? 'View confirmed booking' : 'My bookings'}</Button>
        </Link>
        <Link to={home}>
          <Button variant="secondary">Dashboard</Button>
        </Link>
      </div>
    </Card>
  </Page>;
}
