import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Badge, Button, Card, Page } from '../components/UI';
import { get } from '../api';

export function PaymentStatus(){
  const {id=''}=useParams();const [payment,setPayment]=useState<any>(null);const [error,setError]=useState('');
  useEffect(()=>{let mounted=true;let timer:number|undefined;const refresh=async()=>{try{const p=await get<any>(`/payments/${id}`);if(!mounted)return;setPayment(p);if(p.status==='PENDING')timer=window.setTimeout(refresh,3000)}catch(e:any){if(mounted)setError(e.message||'Could not verify payment status.')}};void refresh();return()=>{mounted=false;if(timer)window.clearTimeout(timer)}},[id]);
  const success=payment?.status==='SUCCEEDED',failed=['FAILED','EXPIRED'].includes(payment?.status);
  return <Page title={success?'Payment complete':failed?'Payment not completed':'Verifying payment'} eyebrow="KPay checkout"><Card className="mx-auto max-w-xl p-7 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-zawana-950 text-zawana-gold">{success?<CheckCircle2/>:failed?<XCircle/>:<Clock3/>}</div><Badge good={success}>{success?'Verified':failed?'Not completed':'Waiting for KPay'}</Badge><p className="mt-4 text-sm leading-6 text-zawana-500">{success?'Your payment has been verified and the service is now active.':failed?'No service was activated. Return to Zawana and try checkout again.':'This page updates automatically when KPay confirms your payment. Please keep it open for a moment.'}</p>{payment?.qrCode&&!success&&!failed&&<img src={payment.qrCode} alt="KPay QR code" className="mx-auto mt-5 max-h-64 max-w-64 rounded-xl border p-2"/>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{payment&&<p className="mt-4 text-xs text-zawana-500">Reference {payment.reference} · {Number(payment.amount).toLocaleString()} MMK</p>}<div className="mt-6 flex justify-center gap-2"><Link to="/bookings"><Button>My bookings</Button></Link><Link to="/membership"><Button variant="secondary">My packages</Button></Link></div></Card></Page>;
}
