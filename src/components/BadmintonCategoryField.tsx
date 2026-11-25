import { useEffect, useState } from 'react';
import { get } from '../api';
export type BadmintonCategory = { id: string; code: string | null; name: string; active: boolean; description?:string };
export const categoryLabel = (code?: string | null) => code ? code.charAt(0) + code.slice(1).toLowerCase() : 'Category needs review';
export function BadmintonCategoryField({ value, onChange, useCode=false }: { value?: string | null; onChange: (value: string) => void; useCode?:boolean }) {
  const [categories, setCategories] = useState<BadmintonCategory[]>([]), [error, setError] = useState('');
  useEffect(() => { let active = true; get<BadmintonCategory[]>('/packages/badminton/categories').then(rows => { if (active) setCategories(rows); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  return <label className="text-sm">Category<select required aria-label="Badminton category" value={value || ''} onChange={e => onChange(e.target.value)} className="mt-2 w-full"><option value="">Choose category</option>{categories.filter(c => c.active && c.code).map(c => <option key={c.id} value={useCode?c.code!:c.id}>{c.name} · {c.code}</option>)}</select>{error && <span role="alert" className="text-xs text-red-700">{error}</span>}</label>;
}
export { BadmintonCategoryManager as BadmintonCategorySettings } from './BadmintonCategoryManager';
