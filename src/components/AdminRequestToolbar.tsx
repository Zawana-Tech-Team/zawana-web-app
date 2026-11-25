import type { ReactNode } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { Button } from './UI';
import './admin-request-tabs.css';

/** Compact controls shared by the admin request tabs. */
export function AdminRequestToolbar({ search, searchLabel, placeholder, onSearch, children, loading, refreshLabel, onRefresh, filtered, onClear, clearLabel='Clear filters' }: {
  search: string; searchLabel: string; placeholder: string; onSearch: (value: string) => void;
  children: ReactNode; loading: boolean; refreshLabel: string; onRefresh: () => void;
  filtered: boolean; onClear: () => void; clearLabel?: string;
}) {
  return <div className="admin-request-toolbar">
    <label className="admin-request-search"><Search size={17} aria-hidden="true"/><input aria-label={searchLabel} placeholder={placeholder} value={search} onChange={event => onSearch(event.target.value)}/></label>
    {children}
    <Button variant="secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" className={loading ? 'admin-request-refreshing' : undefined}/>{refreshLabel}</Button>
    {filtered && <Button variant="ghost" aria-label={clearLabel} onClick={onClear}><X size={14} aria-hidden="true"/>Clear filters</Button>}
  </div>;
}
