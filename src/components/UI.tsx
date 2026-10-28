import './toast.css';
import { AnimatePresence } from 'framer-motion';
import { pageEntrance, motionTokens } from '../design/motion';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocalizedTree, useLanguage } from '../context/LanguageContext';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="zawana-app-logo flex items-center gap-3" data-compact={compact}>
      <img
        src="/logo.png"
        alt="The Zawana crowned-lion logo and official wordmark"
        className={`${compact ? 'h-11 w-11' : 'h-[72px] w-[72px]'} shrink-0 object-contain`}
        width={compact ? 44 : 72}
        height={compact ? 44 : 72}
      />
      {!compact && (
        <div className="hidden leading-none sm:block">
          <span className="block text-[9px] font-semibold tracking-[.16em] text-zawana-950">THE ART OF</span>
          <span className="mt-1.5 block text-[9px] font-semibold tracking-[.16em] text-zawana-500">PERFORMANCE</span>
        </div>
      )}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, variant = 'primary', className = '', loading = false, disabled, ...props }: ButtonProps) {
  const variantClass = {
    primary:
      'border border-zawana-gold bg-zawana-gold text-zawana-950 shadow-sm hover:border-zawana-purple hover:bg-zawana-purple',
    secondary:
      'border border-zawana-border bg-white text-zawana-950 shadow-sm hover:border-zawana-500 hover:bg-zawana-900',
    ghost: 'border border-transparent bg-transparent text-zawana-950 hover:bg-zawana-800',
    danger: 'border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100',
  }[variant];

  return (
    <button
      className={`zawana-button zawana-button--${variant} inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variantClass} ${className}`}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="zawana-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={`zawana-card rounded-2xl border border-zawana-border bg-white shadow-[0_1px_2px_rgba(23,25,28,.035)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return (
    <span
      className={`zawana-badge inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4 ${good ? 'bg-emerald-50 text-emerald-800' : 'bg-zawana-800 text-zawana-600'}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub
}: {
  label: string;
  value: string | number;
  sub?: string
}) {
  return (
    <Card className="zawana-stat p-5 sm:p-6">
      <p className="text-xs font-semibold tracking-wide text-zawana-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-zawana-950 tabular-nums"><StatValue value={value} /></p>
      {sub && <p className="mt-1 text-sm leading-5 text-zawana-500">{sub}</p>}
    </Card>
  );
}

function StatValue({ value }: { value: string | number }) {
  const reduced = useReducedMotion();
  return <AnimatePresence initial={false} mode="popLayout">
    <motion.span className="premium-stat-value" key={String(value)}
      initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -4 }}
      transition={{ duration: motionTokens.popover, ease: motionTokens.ease }}>{value}</motion.span>
  </AnimatePresence>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`premium-skeleton ${className}`} aria-hidden="true" />;
}

export function PageSkeleton() {
  return <div className="premium-loading" role="status" aria-label="Loading page">
    <span className="sr-only">Loading page…</span>
    <Skeleton className="h-3 w-28" /><Skeleton className="mt-4 h-8 w-2/3 max-w-sm" />
    <div className="premium-loading__cards">{[0, 1, 2].map(i => <Card key={i} className="p-6">
      <Skeleton className="h-3 w-24" /><Skeleton className="mt-5 h-8 w-20" /><Skeleton className="mt-4 h-3 w-3/4" />
    </Card>)}</div>
    <Card className="p-6"><Skeleton className="h-5 w-40" />
      {[0, 1, 2, 3].map(i => <Skeleton key={i} className="mt-5 h-10 w-full" />)}
    </Card>
  </div>;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void
}) {
  const { t } = useLanguage();
  if (totalPages <= 1) {
    return <p className="mt-3 text-xs text-zawana-500">
      {total} {t(total === 1 ? 'record' : 'records')}
    </p>;
  }

  const pages = Array.from(
    new Set(
      [1, page - 1, page, page + 1, totalPages].filter(
        number => number >= 1 && number <= totalPages
      )
    )
  ).sort((a, b) => a - b);
  const pageButton =
    'inline-flex min-h-10 items-center justify-center rounded-lg border border-zawana-border bg-white px-3 text-xs font-semibold text-zawana-600 transition hover:bg-zawana-900 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav
      aria-label={t('Pagination')}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <span className="text-xs font-medium text-zawana-500">
        {total} {t('records')} · {t('Page')} {page} {t('of')} {totalPages}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={pageButton}
        >
          <ChevronLeft size={14} /> {t('Previous')}
        </button>
        {pages.map((number, index) => (
          <span key={number} className="contents">
            {index > 0 && number - pages[index - 1] > 1 &&
              <span className="px-1 text-zawana-400" aria-hidden="true">…</span>}
            <button
              type="button"
              aria-current={page === number ? 'page' : undefined}
              aria-label={`${t('Page')} ${number}`}
              onClick={() => onPage(number)}
              className={`h-10 min-w-10 rounded-lg border px-3 text-xs font-semibold transition ${page === number ? 'border-zawana-gold bg-zawana-gold-soft text-zawana-950' : 'border-zawana-border bg-white text-zawana-600 hover:bg-zawana-900'}`}
            >
              {number}
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className={pageButton}
        >
          {t('Next')} <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}

export function Page({
  title,
  eyebrow,
  children,
  actions
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode
}) {
  const reduceMotion = useReducedMotion();
  const { t } = useLanguage();

  return (
    <motion.main
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={pageEntrance}
      className="workspace-page mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 md:px-8 md:py-8"
    >
      <div className="workspace-page__trail"><span>THE ART OF PERFORMANCE</span><Link to="/">Back to the arena <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
      <div className="workspace-page__heading mb-6 flex flex-col justify-between gap-4 sm:mb-8 md:flex-row md:items-end">
        <div className="min-w-0">
          {eyebrow &&
            <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-zawana-accent">
              {t(eyebrow)}
            </p>}
          <h1 className="text-3xl font-bold tracking-[-.04em] text-zawana-950 sm:text-4xl">
            {t(title)}
          </h1>
        </div>
        {actions && <LocalizedTree>{actions}</LocalizedTree>}
      </div>
      <LocalizedTree>{children}</LocalizedTree>
    </motion.main>
  );
}

export function Empty({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode
}) {
  return (
    <Card className="premium-empty p-8 text-center sm:p-10">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-zawana-gold-soft text-zawana-accent">
        <Info size={21} aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-zawana-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zawana-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Toast({
  message,
  type = 'success',
  onClose,
  placement = 'floating'
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
  placement?: 'floating' | 'inline';
}) {
  const reduceMotion = useReducedMotion();
  const { t } = useLanguage();
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Info;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      transition={{ duration: motionTokens.popover, ease: motionTokens.ease }}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`z-toast z-toast--${type} z-toast--${placement}`}
    >
      <span className="z-toast__icon"><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></span>
      <p className="z-toast__message">{t(message)}</p>
      {onClose && <button type="button" aria-label="Dismiss notification" onClick={onClose} className="z-toast__close"><X size={15} strokeWidth={1.5} /></button>}
    </motion.div>
  );
}
