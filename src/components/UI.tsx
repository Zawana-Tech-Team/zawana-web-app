import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/brand/zawana-logo-square.png"
        alt="The Zawana"
        className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} shrink-0 object-contain`}
      />
      {!compact && (
        <div className="hidden leading-none sm:block">
          <span className="block text-[15px] font-black tracking-[.12em] text-zawana-950">THE ZAWANA</span>
          <span className="mt-1 block text-[9px] font-bold tracking-[.23em] text-zawana-500">BADMINTON ARENA</span>
        </div>
      )}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...p }: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: 'bg-zawana-950 text-white hover:-translate-y-0.5 hover:bg-zawana-purple shadow-[0_10px_24px_rgba(29,27,71,.14)]',
    secondary: 'bg-white text-zawana-950 border border-zawana-950/12 hover:border-zawana-gold hover:bg-zawana-900',
    ghost: 'hover:bg-zawana-950/5 text-zawana-950',
    danger: 'bg-red-50 text-red-700 border border-red-100',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-extrabold transition duration-200 ${v} ${className}`}
      {...p}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[24px] border border-zawana-950/8 bg-white ${className}`}>{children}</div>;
}

export function Badge({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.15em] ${good ? 'bg-zawana-gold/16 text-zawana-950' : 'bg-zawana-950/6 text-zawana-950'}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-zawana-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-zawana-950">{value}</p>
      {sub && <p className="mt-1 text-sm text-zawana-500">{sub}</p>}
    </Card>
  );
}

export function Page({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-[1500px] p-4 md:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-zawana-gold">{eyebrow}</p>}
          <h1 className="text-3xl font-black tracking-[-.05em] text-zawana-950 md:text-5xl">{title}</h1>
        </div>
        {actions}
      </div>
      {children}
    </motion.main>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-zawana-950/10 bg-zawana-900" />
      <h3 className="text-lg font-bold text-zawana-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-zawana-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
