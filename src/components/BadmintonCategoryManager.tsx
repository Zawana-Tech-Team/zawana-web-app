import { useEffect, useRef, useState } from 'react';
import { Plus, Folder } from 'lucide-react';
import { get, post, patch, del } from '../api';
import type { BadmintonCategory } from './BadmintonCategoryField';
import { Button } from './UI';
import { DeskDialog } from './court-desk/DeskDialog';
import './badminton-package-management.css';

export function BadmintonCategoryManager({onChanged}:{onChanged?:()=>Promise<void>}){
 const [rows,setRows]=useState<BadmintonCategory[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[retry,setRetry]=useState(0);
 const [editing,setEditing]=useState<BadmintonCategory|'new'|null>(null),[confirmation,setConfirmation]=useState<BadmintonCategory|null>(null),[name,setName]=useState(''),[code,setCode]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[formError,setFormError]=useState('');
 const lock=useRef(false);
 useEffect(()=>{let live=true;setLoading(true);void get<BadmintonCategory[]>('/packages/badminton/categories').then(rows=>{if(live){setRows(rows);setError('');}}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[retry]);
 const open=(row:BadmintonCategory|'new')=>{setEditing(row);setName(row==='new'?'':row.name);setCode(row==='new'?'':row.code||'');setDescription(row==='new'?'':row.description||'');setFormError('');};
 const run=async(task:()=>Promise<unknown>)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setFormError('');setError('');
  try{await task();setEditing(null);setConfirmation(null);setNotice('Category saved.');try{setRows(await get<BadmintonCategory[]>('/packages/badminton/categories'));await onChanged?.();}catch{setError('Category saved, but the list could not refresh. Retry to load the latest categories.');}}
  catch(error){setFormError(error instanceof Error?error.message:'Could not save category.');}
  finally{lock.current=false;setBusy(false);}
 };
 const save=()=>run(()=>editing==='new'?post('/packages/badminton/categories',{name:name.trim(),code,description}):patch(`/packages/badminton/categories/${editing!.id}`,{name:name.trim(),description}));
 const shown=rows.filter(row=>`${row.name} ${row.code||''}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="category-manager">
  <div className="package-management-tools"><input aria-label="Search categories" placeholder="Search categories" value={query} onChange={event=>setQuery(event.target.value)}/><Button disabled={busy} onClick={()=>open('new')}><Plus size={16} aria-hidden="true"/>Create category</Button></div>
  {notice&&<p role="status" className="package-management-notice">{notice}</p>}{error&&<div role="alert" className="package-management-error"><p>{error}</p><Button variant="secondary" onClick={()=>setRetry(value=>value+1)}>Retry categories</Button></div>}
  {loading?<p role="status">Loading categories…</p>:!shown.length?<p className="package-management-empty">{query?'No categories match your search.':'No categories yet.'}</p>:<ul className="category-management-grid">{shown.map(row=><li key={row.id}><div className="category-card-heading"><span className="package-management-icon" aria-hidden="true"><Folder size={20}/></span><span className="category-state" data-active={row.active}>{row.active?'Active':'Archived'}</span></div><h2>{row.name}</h2><p className="category-code">{row.code||'Legacy category'}</p>{row.description&&<p className="category-description">{row.description}</p>}<div className="category-card-actions"><Button variant="secondary" disabled={busy} onClick={()=>open(row)}>Edit category</Button><Button variant="ghost" disabled={busy} onClick={()=>{setFormError('');setConfirmation(row);}}>{row.active?'Archive':'Reactivate'}</Button></div></li>)}</ul>}
  {editing&&<DeskDialog title={editing==='new'?'Create category':'Edit category'} heading={editing==='new'?'Create category':editing.name} eyebrow={editing==='new'?undefined:'Edit category'} busy={busy} onClose={()=>{if(!lock.current)setEditing(null);}} actions={<Button type="submit" form="category-form" loading={busy} disabled={busy||!name.trim()||(editing==='new'&&!/^[A-Z][A-Z0-9_]{1,39}$/.test(code))}>Save category</Button>}>
   <form id="category-form" className="category-form" onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={busy}><label>Category name<input required maxLength={120} value={name} onChange={event=>setName(event.target.value)}/></label><label>Category code<input required={editing==='new'} disabled={editing!=='new'} pattern="[A-Z][A-Z0-9_]+" maxLength={40} value={code} onChange={event=>setCode(event.target.value.toUpperCase())}/></label><label>Description (optional)<textarea maxLength={2000} value={description} onChange={event=>setDescription(event.target.value)}/></label></fieldset></form>{formError&&<p role="alert" className="package-management-error">{formError}</p>}
  </DeskDialog>}
  {confirmation&&<DeskDialog title={confirmation.active?'Archive category?':'Reactivate category?'} heading={confirmation.name} eyebrow={confirmation.active?'Archive category':'Reactivate category'} size="compact" busy={busy} onClose={()=>{if(!lock.current)setConfirmation(null);}} actions={<Button loading={busy} disabled={busy} onClick={()=>void run(()=>confirmation.active?del(`/packages/badminton/categories/${confirmation.id}`):patch(`/packages/badminton/categories/${confirmation.id}`,{active:true}))}>{confirmation.active?'Archive category':'Reactivate category'}</Button>}><p className="text-sm leading-relaxed">{confirmation.active?'Stop using this category for new package sales. Existing packages, sessions and history remain available.':'Make this category available for new package sales again.'}</p>{formError&&<p role="alert" className="package-management-error">{formError}</p>}</DeskDialog>}
 </div>;
}
