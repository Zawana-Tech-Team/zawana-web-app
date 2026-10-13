import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from './UI';
import { LanguageSwitcher, LocalizedTree } from '../context/LanguageContext';

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
    <LocalizedTree>
      <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
        <section
          className="hidden min-h-screen flex-col bg-zawana-page p-7 lg:flex xl:p-10"
          aria-label="Zawana sports arena"
        >
          <Logo />
          <figure className="relative mt-8 min-h-[560px] flex-1 overflow-hidden rounded-[28px] bg-zawana-950">
            <img
              src="/facilities/court.webp"
              alt="Badminton courts at the Zawana arena"
              width={2896}
              height={2172}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-zawana-950/85 via-zawana-950/10 to-zawana-950/15"
            />
            <figcaption className="absolute inset-x-8 bottom-8 text-white xl:inset-x-10 xl:bottom-10">
              <p className="eyebrow text-zawana-gold">Badminton · Training · Recovery</p>
              <h2 className="mt-4 max-w-xl text-5xl font-bold leading-[.98] tracking-[-.055em] xl:text-6xl">Play with purpose. Grow together.</h2>
              <p className="mt-5 max-w-lg text-sm leading-6 text-white/80">A premium training environment for players, athletes, and people who love to move.</p>
            </figcaption>
          </figure>
          <p className="pt-5 text-xs font-medium text-zawana-500">Yangon · Est. 2022</p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 md:py-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between gap-3 lg:hidden">
              <Logo />
              <span className="text-xs font-medium text-zawana-500">Member access</span>
            </div>
            <div className="mb-4 flex justify-end">
              <LanguageSwitcher />
            </div>
            <Link
              to="/"
              className="mb-7 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zawana-500 transition hover:bg-zawana-800 hover:text-zawana-950"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Back to Zawana</Link>
            <p className="eyebrow text-zawana-accent">The Zawana</p>
            <h1 className="mt-3 text-4xl font-bold tracking-[-.045em] text-zawana-950">{title}</h1>
            <div className="mt-7">{children}</div>
          </div>
        </section>
      </div>
    </LocalizedTree>
  );
}
