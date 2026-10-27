import { useEffect, useState } from 'react';
import { get, patch } from '../api';
import { useAuth } from '../context/AuthContext';
export type BadmintonCategory = { id: string; code: string | null; name: string; active: boolean };
export const categoryLabel = (code?: string | null) => code ? code.charAt(0) + code.slice(1).toLowerCase() : 'Category needs review';
export function BadmintonCategoryField({ value, onChange }: { value?: string | null; onChange: (value: string) => void }) {
  const [categories, setCategories] = useState<BadmintonCategory[]>([]), [error, setError] = useState('');
  useEffect(() => { let active = true; get<BadmintonCategory[]>('/packages/badminton/categories').then(rows => { if (active) setCategories(rows); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <label className="text-sm">Category<select required aria-label="Badminton category" value={value || ''} onChange={e => onChange(e.target.value)} className="mt-2 w-full"><option value="">Choose category</option>{categories.filter(c => c.active && c.code).map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select>{error && <span role="alert" className="text-xs text-red-700">{error}</span>}</label>;
}
export function BadmintonCategorySettings() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<BadmintonCategory[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { if (user?.role === 'admin') void get<BadmintonCategory[]>('/packages/badminton/categories').then(setCategories).catch(e => setError(e.message)); }, [user?.role]);
  if (user?.role !== 'admin') return null;
  return <details className="rounded-2xl border border-zawana-border bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">Category display names</summary><p className="mt-3 text-xs text-zawana-500">Codes stay fixed. Edit the names shown in the catalogue and front desk.</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{categories.filter(c => c.code).map(c => <form key={c.id} onSubmit={async e => { e.preventDefault(); setBusy(c.id); setError(''); setNotice(''); try { await patch(`/packages/badminton/categories/${c.id}`, { name: c.name }); setNotice('Category name saved.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save category.'); } finally { setBusy(''); } }}><label className="text-xs text-zawana-500">{c.code}<input required maxLength={120} aria-label={`${c.code} display name`} className="mt-2 w-full" value={c.name} onChange={e => setCategories(rows => rows.map(row => row.id === c.id ? { ...row, name: e.target.value } : row))} /></label><button disabled={!!busy} className="mt-2 min-h-10 text-xs font-semibold">{busy === c.id ? 'Saving…' : 'Save name'}</button></form>)}</div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}</details>;
}
