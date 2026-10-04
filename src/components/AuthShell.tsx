import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from './UI';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
      <div className="relative hidden overflow-hidden bg-zawana-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-zawana-gold/35" />
        <div className="absolute -right-2 top-24 h-36 w-36 rounded-full border border-zawana-gold/25" />
        <Logo />
        <div className="relative max-w-xl">
          <p className="eyebrow text-zawana-gold">Badminton & sports arena</p>
          <h1 className="mt-6 text-7xl font-black leading-[.87] tracking-[-.07em]">
            PLAY.<br />TRAIN.<br /><span className="text-zawana-gold">PERFORM.</span>
          </h1>
          <p className="mt-8 max-w-lg text-base leading-7 text-white/65">
            A premium training environment for players, athletes and people who love to move.
          </p>
        </div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-white/45">Yangon · Est. 2022</p>
      </div>
      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <Link to="/" className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-full border border-zawana-950/10 px-4 text-sm font-bold text-zawana-500 transition hover:border-zawana-gold hover:text-zawana-950"><ArrowLeft size={15}/> Back to Zawana</Link>
          <p className="eyebrow text-zawana-gold">The Zawana</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-.05em]">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
