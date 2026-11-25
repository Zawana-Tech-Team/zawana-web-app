import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2, UserRound, Pencil } from 'lucide-react';
import { get, patch, post, del } from '../api';
import { Page, Button } from './UI';
import { DeskDialog } from './court-desk/DeskDialog';
import { HistoryPagination } from './member-booking/HistoryPagination';
import { ImageUpload, mediaImageSrc } from './ImageUpload';
import './coach-management.css';

type Coach={id:string;name:string;email:string;phone:string;specialty:string;department:string;status:string;imageUrl?:string|null;userId?:string|null};
type Account={id:string;name:string;email:string;phone?:string|null;active:boolean};
type Form={name:string;email:string;phone:string;specialty:string;status:string;imageUrl:string|null};
export function CoachManagement({department='Badminton'}:{department?:'Badminton'|'Gym'}){
 const [rows,setRows]=useState<Coach[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1),[open,setOpen]=useState(false),[editing,setEditing]=useState<Coach|null>(null),[deleting,setDeleting]=useState<Coach|null>(null);
 const blank=():Form=>({name:'',email:'',phone:'',specialty:department,status:'active',imageUrl:null});
 const [form,setForm]=useState<Form>(blank),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false),[uploadBusy,setUploadBusy]=useState(false);
 const [accountsLoading,setAccountsLoading]=useState(true),[accountsError,setAccountsError]=useState('');
 const lock=useRef(false),blocked=busy||uploadBusy;
 const load=useCallback(async()=>{
  const coaches=await get<Coach[]>('/coaches');return coaches.filter(coach=>coach.department===department);
 },[department]);
 useEffect(()=>{let live=true;setLoading(true);setError('');void load().then(rows=>{if(live)setRows(rows);}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[load,revision]);
 useEffect(()=>{let live=true;setAccountsLoading(true);const read=async()=>{const result:Account[]=[];for(let page=1;;page++){const response=await get<{data:Account[];pagination:{totalPages:number}}>(`/users?page=${page}&limit=100&role=coach&status=current`);result.push(...response.data);if(page>=response.pagination.totalPages)break;}if(live){setAccounts(result);setAccountsError('');}};void read().catch(error=>{if(live)setAccountsError(error.message||'Could not load coach accounts.');}).finally(()=>{if(live)setAccountsLoading(false);});return()=>{live=false;};},[revision]);
 const start=(coach?:Coach)=>{setEditing(coach||null);setForm(coach?{name:coach.name,email:coach.email||'',phone:coach.phone||'',specialty:coach.specialty||department,status:coach.status,imageUrl:coach.imageUrl||null}:blank());setFormError('');setOpen(true);};
 const refreshSaved=async(message:string)=>{setNotice(message);try{setRows(await load());}catch{setError('The change was saved, but the list could not refresh. Retry to load the latest coaches.');}};
 const save=async()=>{
  if(lock.current||uploadBusy)return;lock.current=true;setBusy(true);setFormError('');
  try{const payload={name:form.name.trim(),specialty:form.specialty,phone:form.phone.trim(),status:form.status,department,imageUrl:form.imageUrl,...(!editing||form.email!==editing.email?{email:form.email}:{})};if(editing)await patch(`/coaches/${encodeURIComponent(editing.id)}`,payload);else await post('/coaches',payload);setOpen(false);await refreshSaved(editing?'Coach updated.':'Coach created.');}
  catch(error){setFormError(error instanceof Error?error.message:'Could not save coach.');}finally{lock.current=false;setBusy(false);}
 };
 const remove=async()=>{if(!deleting||lock.current)return;lock.current=true;setBusy(true);setFormError('');try{await del(`/coaches/${encodeURIComponent(deleting.id)}`);setDeleting(null);await refreshSaved('Coach profile deleted.');}catch(error){setFormError(error instanceof Error?error.message:'Could not delete coach.');}finally{lock.current=false;setBusy(false);}};
 const filtered=rows.filter(row=>(!status||row.status===status)&&`${row.name} ${row.email} ${row.phone} ${row.specialty}`.toLowerCase().includes(query.trim().toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/12)),current=Math.min(page,pages);
 const options=accounts.filter(account=>account.active&&!rows.some(row=>row.userId===account.id&&row.id!==editing?.id));
 const currentMissing=!!form.email&&!options.some(account=>account.email===form.email);
 return <Page title={`${department} coaches`} eyebrow="Coach management" actions={<div className="coach-heading-actions"><Link to="/admin/users">Manage accounts</Link><Button disabled={blocked} onClick={()=>start()}><Plus size={16} aria-hidden="true"/>Add coach</Button></div>}><div className="coach-management">
  {notice&&<p role="status" className="coach-notice">{notice}</p>}
  <div className="coach-tools"><label><Search size={17} aria-hidden="true"/><input aria-label="Search coaches" placeholder="Search name, contact or coaching area" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></label><select aria-label="Coach status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>{(query||status)&&<Button variant="ghost" onClick={()=>{setQuery('');setStatus('');setPage(1);}}>Clear filters</Button>}</div>
  {error&&<div role="alert" className="coach-error"><p>{error}</p><Button variant="secondary" onClick={()=>setRevision(value=>value+1)}>Retry coaches</Button></div>}
  {loading?<p role="status" className="coach-empty">Loading coaches…</p>:!filtered.length&&!error?<div className="coach-empty"><UserRound size={30} aria-hidden="true"/><h2>{query||status?'No matching coaches':'No coach profiles yet'}</h2><p>{query||status?'Adjust or clear your filters.':'Add a coach linked to an existing Coach account.'}</p></div>:<div className="coach-grid">{filtered.slice((current-1)*12,current*12).map(coach=><article key={coach.id} aria-label={`Coach ${coach.name}`}><div className="coach-card-top"><span className="coach-avatar" aria-hidden="true">{coach.imageUrl?<img src={mediaImageSrc(coach.imageUrl)} alt=""/>:coach.name.trim().split(/\s+/).slice(0,2).map(name=>name[0]).join('')}</span><span className="coach-state" data-active={coach.status==='active'}>{coach.status==='active'?'Active':'Inactive'}</span></div><h2>{coach.name}</h2>{coach.specialty&&<p className="coach-area">{coach.specialty}</p>}<div className="coach-contact">{coach.phone&&<p>{coach.phone}</p>}{coach.email&&<p>{coach.email}</p>}</div><div className="coach-card-actions"><Button variant="secondary" disabled={blocked} onClick={()=>start(coach)} aria-label={`Edit coach ${coach.name}`}><Pencil size={14} aria-hidden="true"/>Edit coach</Button><Button variant="ghost" disabled={blocked} onClick={()=>{setFormError('');setDeleting(coach);}} aria-label={`Delete coach ${coach.name}`}><Trash2 size={15} aria-hidden="true"/></Button></div></article>)}</div>}
  {!loading&&!error&&<HistoryPagination page={current} totalPages={pages} total={filtered.length} pageSize={12} noun={filtered.length===1?'coach':'coaches'} label="Coach management pagination" disabled={blocked} onPage={setPage}/>}
  {open&&<DeskDialog title={editing?'Edit coach':'Create coach'} heading={editing?editing.name:'Add coach'} eyebrow={editing?'Edit coach':undefined} busy={blocked} onClose={()=>{if(!lock.current&&!uploadBusy)setOpen(false);}} className="coach-form-dialog" actions={<Button type="submit" form="coach-profile-form" loading={busy} disabled={blocked||!form.name.trim()||(!editing&&!form.email)}>{editing?'Save changes':'Create coach'}</Button>}>
   <form id="coach-profile-form" className="coach-form" onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={blocked}>
    <label>Coach login account<select aria-label="Coach login account" required={!editing} value={form.email} onChange={event=>{const account=accounts.find(account=>account.email===event.target.value);setForm(value=>({...value,email:event.target.value,...(!editing&&account?{name:account.name,phone:account.phone||''}:{})}));}}><option value="">Choose a coach account</option>{currentMissing&&<option value={form.email}>{form.email}</option>}{options.map(account=><option key={account.id} value={account.email}>{account.name} · {account.email}</option>)}</select></label>
    {accountsLoading&&<p role="status" className="coach-form-hint">Loading coach accounts…</p>}{accountsError&&<div role="alert" className="coach-error"><p>{accountsError}</p><Button variant="secondary" onClick={()=>setRevision(value=>value+1)}>Retry accounts</Button></div>}
    {!editing&&!accountsLoading&&!accountsError&&!options.length&&<p className="coach-form-hint">Create an active Coach account in <Link to="/admin/users">User Management</Link> first.</p>}
    <label>Name<input required maxLength={120} autoComplete="name" value={form.name} onChange={event=>setForm(value=>({...value,name:event.target.value}))}/></label>
    <div className="coach-form-grid"><label>Coaching area<select aria-label="Coaching area" value={form.specialty} onChange={event=>setForm(value=>({...value,specialty:event.target.value}))}>{!['Badminton','Gym','Badminton & Gym','Other'].includes(form.specialty)&&<option>{form.specialty}</option>}<option>Badminton</option><option>Gym</option><option>Badminton &amp; Gym</option><option>Other</option></select></label><label>Status<select aria-label="Status" value={form.status} onChange={event=>setForm(value=>({...value,status:event.target.value}))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
    <label>Phone <span>Optional</span><input type="tel" autoComplete="tel" value={form.phone} onChange={event=>setForm(value=>({...value,phone:event.target.value}))}/></label>
    <ImageUpload label="Coach profile image" value={form.imageUrl} onChange={imageUrl=>setForm(value=>({...value,imageUrl}))} onBusyChange={setUploadBusy}/>
   </fieldset></form>{formError&&<p role="alert" className="coach-error">{formError}</p>}
  </DeskDialog>}
  {deleting&&<DeskDialog title="Delete coach profile?" heading={deleting.name} eyebrow="Delete coach profile" size="compact" busy={busy} onClose={()=>{if(!lock.current)setDeleting(null);}} actions={<Button variant="danger" disabled={busy} loading={busy} onClick={()=>void remove()}>Delete coach</Button>}><p className="text-sm leading-relaxed">Permanently delete this coach profile? This action cannot be undone.</p>{formError&&<p role="alert" className="coach-error">{formError}</p>}</DeskDialog>}
 </div></Page>;
}
