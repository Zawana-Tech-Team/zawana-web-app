import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Page } from '../components/UI';
import { get } from '../api';
export function PaymentStatus({ home = '/member' }: { home?: string }) {
  const { id = '' } = useParams();
  const [receipt, setReceipt] = useState<{ reference: string; status: string; amount: number; confirmationMode?: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; void get<NonNullable<typeof receipt>>(`/payments/${encodeURIComponent(id)}`).then(data => { if (live) setReceipt(data); }).catch(error => { if (live) setError(error.message); }); return () => { live = false; }; }, [id]);
  return <Page title="Payment receipt" eyebrow="Manual confirmation"><Card className="mx-auto max-w-lg p-6">
    <h2 className="text-xl font-semibold">{receipt?.status === 'PAID' ? 'Payment confirmed' : 'Payment record'}</h2>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {receipt && <dl className="my-5 space-y-3"><dt>Reference</dt><dd className="break-all">{receipt.reference}</dd><dt>Amount</dt><dd>{receipt.amount.toLocaleString()} MMK</dd><dt>Status</dt><dd>{receipt.status}</dd><dt>Confirmation</dt><dd>{receipt.confirmationMode || 'Legacy record'}</dd></dl>}
    <p className="my-4 text-sm text-zawana-500">Manual/simulated confirmations do not represent an externally verified charge. Unpaid records require an explicit confirmation from their booking or order.</p>
    <Link to={home}><Button>Back to dashboard</Button></Link>
  </Card></Page>;
}
