import { Printer, X } from 'lucide-react';
import { DialogSurface } from './Interactions';
import { Button } from './UI';
import { gymMoney, type GymEnrollment } from '../types/gym';

export default function GymReceipt({ enrollment: e, onClose }: { enrollment: GymEnrollment; onClose: () => void }) {
  return <DialogSurface title="Gym receipt" onClose={onClose} className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
    <div className="gym-receipt max-h-[85vh] overflow-y-auto p-6 sm:p-8">
      <p className="text-xs font-bold tracking-[.2em] text-zawana-accent">ZAWANA · THE ART OF PERFORMANCE</p>
      <div className="mt-3 flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Payment receipt</h2><Button variant="ghost" className="print:hidden" aria-label="Close receipt" onClick={onClose}><X size={18} /></Button></div>
      <p className="mt-2 break-all text-xs text-zawana-500">{e.transaction?.id} · {e.transaction?.date}</p>
      <div className="my-6 border-y py-5">
        <h3 className="text-lg font-bold">{e.snapshot.title}</h3>
        <p className="mt-2 text-sm">{e.members.map(m => m.user.name).join(', ')}</p>
        <p className="mt-2 text-sm text-zawana-500">{e.startDate} – {e.expiryDate}</p>
        <p className="mt-2 text-xs text-zawana-500">{e.code} · Package version {e.packageVersion}</p>
        {e.coach && <p className="mt-2 text-sm">Coach {e.coach.name}</p>}
      </div>
      <div className="flex justify-between gap-3 text-xl font-bold"><span>Paid</span><span>{gymMoney(e.totalPrice)}</span></div>
      <p className="mt-3 text-sm text-zawana-500">{e.transaction?.paymentMethod} · Recorded by {e.transaction?.staff}</p>
      <p className="mt-5 text-xs text-zawana-500">{e.snapshot.description}</p>
      <Button className="mt-6 print:hidden" onClick={() => window.print()}><Printer size={16} /> Print receipt</Button>
    </div>
  </DialogSurface>;
}
