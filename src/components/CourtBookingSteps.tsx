import { Check, ChevronRight } from 'lucide-react';

export function CourtBookingSteps({ step, includeReview = false, canChooseCourts, canReview = false, busy = false, onChange }: {
  step: 1 | 2 | 3;
  includeReview?: boolean;
  canChooseCourts: boolean;
  canReview?: boolean;
  busy?: boolean;
  onChange: (step: 1 | 2 | 3) => void;
}) {
  const steps = includeReview ? [1, 2, 3] as const : [1, 2] as const;
  return <nav aria-label="Booking steps" className="flex items-center gap-2 rounded-2xl border border-zawana-border bg-white p-4 sm:gap-5 sm:p-5">
    {steps.map(n => <button key={n} type="button" aria-current={step === n ? 'step' : undefined}
      disabled={busy || (n === 2 && !canChooseCourts) || (n === 3 && !canReview)} onClick={() => onChange(n)}
      className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-40 sm:gap-3 sm:text-sm ${step === n ? 'text-zawana-950' : 'text-zawana-500'}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold sm:h-8 sm:w-8 ${step === n ? 'border-zawana-950 bg-zawana-950 text-white' : 'border-zawana-border'}`}>{n < step ? <Check size={14} /> : n}</span>
      <span className="font-semibold">{n === 1 ? 'Dates & times' : n === 2 ? 'Courts & sessions' : 'Review change'}</span>
      {n !== steps.length && <ChevronRight size={14} className="ml-auto hidden shrink-0 text-zawana-500 sm:block" />}
    </button>)}
  </nav>;
}
