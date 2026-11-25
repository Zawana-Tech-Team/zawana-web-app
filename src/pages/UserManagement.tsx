import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, CreditCard, Eye, EyeOff, LockKeyhole, Package, Pencil, Plus, Search, ShieldCheck, Stethoscope, Trash2 } from 'lucide-react';
import { Select } from '../components/Select';
import { Button, Empty, Page, Toast } from '../components/UI';
import { DeskDialog } from '../components/court-desk/DeskDialog';
import { CourtActionMenu } from '../components/court-desk/CourtActionMenu';
import { HistoryPagination } from '../components/member-booking/HistoryPagination';
import { ImageUpload, mediaImageSrc } from '../components/ImageUpload';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatBookingDate } from '../utils/bookingDates';
import { normalizeBookingTime } from '../utils/bookingTime';
import { get, patch, post, del } from '../api';
import './user-management.css';

type Account={id:string;name:string;email:string|null;role:string;phone?:string|null;avatar?:string|null;membership?:string|null;active:boolean;deletedAt?:string|null;createdAt:string;lastLoginAt?:string|null;coachId?:string|null;coachProfile?:{id:string;department:string;imageUrl?:string|null}|null};
type AccountPage={data:Account[];pagination:{page:number;limit:number;total:number;totalPages:number}};
type BookingActivity={id:string;title:string;date:string;time:string;status:string;createdAt?:string};
type PackageActivity={id:string;packageName:string;sessionsRemaining:number;sessionsTotal:number;expiryDate:string;status:string;createdAt?:string};
type PaymentActivity={id:string;item:string;date:string;finalAmount:number;status:string;createdAt?:string};
type AppointmentActivity={id:string;type:string;date:string;time:string;status:string;createdAt?:string};
type Activity={bookings:BookingActivity[];badmintonEnrollments:PackageActivity[];transactions:PaymentActivity[];appointments:AppointmentActivity[]};
type Form={name:string;email:string;phone:string;role:string;active:boolean;password:string;coachDepartment:string};
const PAGE_SIZE=10;
const roles=['member','coach','doctor','admin','owner','gym_fo','clinic_fo','badminton_fo','store_fo','cafe_fo'];
const roleLabel=(value:string)=>({gym_fo:'Gym front office',clinic_fo:'Clinic front office',badminton_fo:'Badminton front office',store_fo:'Store front office',cafe_fo:'Cafe front office'} as Record<string,string>)[value]||value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const emailReleased=(account:Account)=>account.email===`deleted-${account.id}@accounts.invalid`;
const contact=(account:Account)=>emailReleased(account)?'Email released':account.email||account.phone||'No contact details';
const blankForm=():Form=>({name:'',email:'',phone:'',role:'member',active:true,password:'',coachDepartment:'Badminton'});
const message=(failure:unknown,fallback:string)=>failure instanceof Error?failure.message:fallback;
const timestamp=(value:string|null|undefined,locale:string)=>value&&Number.isFinite(new Date(value).getTime())?new Intl.DateTimeFormat(locale,{timeZone:'Asia/Yangon',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'No sign-in recorded';

function Avatar({account}:{account:Account}){
 const image=account.avatar||account.coachProfile?.imageUrl;
 return <span className="users-avatar" aria-hidden="true">{image?<img src={mediaImageSrc(image)} alt=""/>:account.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</span>;
}
function State({value}:{value:string}){
 const state=value.toLowerCase(),positive=['active','paid','confirmed','completed','present'].includes(state),negative=['deleted','inactive','cancelled','coach_declined','failed'].includes(state);
 const Icon=positive?CheckCircle2:negative?LockKeyhole:Clock3;
 return <span className="users-state" data-tone={positive?'positive':negative?'muted':'pending'}><Icon size={13} aria-hidden="true"/>{roleLabel(state)}</span>;
}
function RecentActivity({activity}:{activity:Activity}){
 const {locale}=useLanguage(),[visible,setVisible]=useState(10);
 const day=(date:string)=>formatBookingDate(date,{day:'numeric',month:'short',year:'numeric'},locale);
 const rows=[
  ...activity.bookings.map(row=>({key:`booking:${row.id}`,title:row.title,status:row.status,kind:'Booking',icon:CalendarDays,created:row.createdAt||row.date,detail:`${day(row.date)} · ${normalizeBookingTime(row.time)}`})),
  ...activity.badmintonEnrollments.map(row=>({key:`package:${row.id}`,title:row.packageName,status:row.status,kind:'Package',icon:Package,created:row.createdAt||'',detail:`${row.sessionsRemaining} of ${row.sessionsTotal} sessions left · Valid until ${day(row.expiryDate)}`})),
  ...activity.transactions.map(row=>({key:`payment:${row.id}`,title:row.item,status:row.status,kind:'Payment',icon:CreditCard,created:row.createdAt||row.date,detail:`${Number(row.finalAmount).toLocaleString(locale)} MMK · ${day(row.date)}`})),
  ...activity.appointments.map(row=>({key:`appointment:${row.id}`,title:row.type,status:row.status,kind:'Appointment',icon:Stethoscope,created:row.createdAt||row.date,detail:`${day(row.date)} · ${row.time}`})),
 ].sort((a,b)=>(Date.parse(b.created)||0)-(Date.parse(a.created)||0)||a.key.localeCompare(b.key));
 return <section className="users-activity" aria-label="Recent account activity"><h3>Recent activity</h3>{!rows.length?<p className="users-empty-activity">No account activity yet.</p>:<><ol>{rows.slice(0,visible).map(({key,title,status,kind,icon:Icon,created,detail})=><li key={key}><span className="users-activity-icon"><Icon size={17} aria-hidden="true"/></span><div><p className="users-activity-type">{kind}{created&&<span> · {timestamp(created,locale)}</span>}</p><h4>{title}</h4><p>{detail}</p></div><State value={status}/></li>)}</ol>{visible<rows.length&&<Button variant="secondary" onClick={()=>setVisible(count=>count+10)}>Show more activity</Button>}</>}</section>;
}

export default function UserManagement(){
 const {user}=useAuth(),{locale}=useLanguage();
 const [users,setUsers]=useState<Account[]>([]),[loading,setLoading]=useState(true),[hasLoaded,setHasLoaded]=useState(false),[listError,setListError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
 const [page,setPage]=useState(1),[pageInfo,setPageInfo]=useState({page:1,limit:PAGE_SIZE,total:0,totalPages:0}),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[role,setRole]=useState('all'),[status,setStatus]=useState('current');
 const [mode,setMode]=useState<'create'|'edit'|'view'|null>(null),[selected,setSelected]=useState<Account|null>(null),[form,setForm]=useState<Form>(blankForm),[formError,setFormError]=useState(''),[passwordOpen,setPasswordOpen]=useState(false),[showPassword,setShowPassword]=useState(false);
 const [coachImage,setCoachImage]=useState<string|null>(null),[imageDirty,setImageDirty]=useState(false),[imageBusy,setImageBusy]=useState(false),[busy,setBusy]=useState(false),[openMenu,setOpenMenu]=useState('');
 const [activity,setActivity]=useState<Activity|null>(null),[activityError,setActivityError]=useState(''),[activityRetry,setActivityRetry]=useState(0);
 const [deleteTarget,setDeleteTarget]=useState<Account|null>(null),[confirmationName,setConfirmationName]=useState(''),[deleteError,setDeleteError]=useState('');
 const lock=useRef(false),generation=useRef(0),lastQuery=useRef(''),resultsHeading=useRef<HTMLHeadingElement>(null),paging=useRef(false);
 useEffect(()=>{const value=search.trim();if(value===query)return;const timer=setTimeout(()=>{setQuery(value);setPage(1);},250);return()=>clearTimeout(timer);},[search,query]);
 const load=useCallback(async(isLive:()=>boolean=()=>true)=>{
  const version=++generation.current,params=new URLSearchParams({page:String(page),limit:String(PAGE_SIZE),status,role,search:query});
  const result=await get<AccountPage>(`/users?${params}`);if(version!==generation.current||!isLive())return;
  const last=Math.max(1,result.pagination.totalPages);if(page>last){setPage(last);return;}
  setUsers(result.data);setPageInfo(result.pagination);setHasLoaded(true);setListError('');
 },[page,status,role,query]);
 useEffect(()=>{let live=true;const key=JSON.stringify({page,status,role,query});setLoading(true);if(lastQuery.current!==key){lastQuery.current=key;setUsers([]);setHasLoaded(false);setListError('');setOpenMenu('');}void load(()=>live).catch(failure=>{if(live)setListError(message(failure,'Could not load accounts.'));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[load,page,status,role,query,retry]);
 useEffect(()=>{if(!loading&&paging.current&&pageInfo.page===page){paging.current=false;resultsHeading.current?.focus({preventScroll:true});resultsHeading.current?.scrollIntoView({block:'start'});}},[loading,pageInfo.page,page]);
 useEffect(()=>{const close=()=>setOpenMenu('');window.addEventListener('resize',close);return()=>window.removeEventListener('resize',close);},[]);
 useEffect(()=>{
  if(mode!=='view'||!selected)return;let live=true;setActivity(null);setActivityError('');
  void get<Activity>(`/users/${encodeURIComponent(selected.id)}/activity`).then(result=>{if(live)setActivity(result);}).catch(failure=>{if(live)setActivityError(message(failure,'Could not load account activity.'));});return()=>{live=false;};
 },[mode,selected,activityRetry]);
 const close=()=>{if(lock.current||imageBusy)return;setMode(null);setSelected(null);setFormError('');setShowPassword(false);};
 const create=()=>{setMode('create');setSelected(null);setForm(blankForm());setFormError('');setPasswordOpen(true);setShowPassword(false);setCoachImage(null);setImageDirty(false);setOpenMenu('');};
 const edit=(account:Account)=>{setSelected(account);setForm({name:account.name,email:account.email||'',phone:account.phone||'',role:account.role,active:account.active,password:'',coachDepartment:account.coachProfile?.department||'Badminton'});setMode('edit');setPasswordOpen(false);setShowPassword(false);setFormError('');setCoachImage(account.coachProfile?.imageUrl||null);setImageDirty(false);setOpenMenu('');};
 const view=(account:Account)=>{setSelected(account);setActivity(null);setActivityError('');setMode('view');setOpenMenu('');};
 const refreshAfterSave=async()=>{try{await load();}catch{setListError('The account was saved, but the list could not refresh. Retry to load the updated accounts.');}};
 const save=async()=>{
  if(lock.current||imageBusy||!['create','edit'].includes(mode||''))return;lock.current=true;setBusy(true);setFormError('');
  try{
   const creating=mode==='create';let saved:Account;
   if(creating){saved=await post<Account>('/users',{name:form.name.trim(),email:form.email.trim(),phone:form.phone.trim(),role:form.role,password:form.password,...(form.role==='coach'?{coachDepartment:form.coachDepartment}:{})});}
   else{if(!selected)return;const changes={name:form.name.trim(),phone:form.phone.trim(),role:form.role,...(form.role==='coach'?{coachDepartment:form.coachDepartment}:{}),...(form.active!==selected.active?{active:form.active}:{}),...(passwordOpen&&form.password?{password:form.password}:{})};saved=await patch<Account>(`/users/${encodeURIComponent(selected.id)}`,changes);}
   let imageFailed=false;
   if(form.role==='coach'&&(creating?!!coachImage:imageDirty)){
    try{let coachId=saved.coachId||selected?.coachProfile?.id;if(!coachId){const coaches=await get<{id:string;userId:string|null}[]>('/coaches');coachId=coaches.find(coach=>coach.userId===saved.id)?.id;}if(!coachId)throw new Error('Coach profile unavailable');await patch(`/coaches/${encodeURIComponent(coachId)}`,{imageUrl:coachImage});}catch{imageFailed=true;}
   }
   setMode(null);setSelected(null);setShowPassword(false);setNotice(imageFailed?'Account saved. The coach image could not be saved; you can try again in Edit account.':creating?'Account created successfully.':'Account updated successfully.');await refreshAfterSave();
  }catch(failure){setFormError(message(failure,'Could not save this account.'));}finally{lock.current=false;setBusy(false);}
 };
 const toggle=async(account:Account)=>{if(lock.current)return;lock.current=true;setBusy(true);setOpenMenu('');setListError('');try{await patch(`/users/${encodeURIComponent(account.id)}`,{active:!account.active});setNotice(`${account.name} ${account.active?'deactivated':'activated'}.`);await refreshAfterSave();}catch(failure){setListError(message(failure,'Could not update this account.'));}finally{lock.current=false;setBusy(false);}};
 const remove=(account:Account,origin?:HTMLElement)=>{
  // Keep a connected return target when a menu item opens the confirmation dialog.
  const menuId=origin?.closest('[role="menu"]')?.id;
  if(menuId)document.querySelector<HTMLButtonElement>(`button[aria-controls="${CSS.escape(menuId)}"]`)?.focus({preventScroll:true});
  setOpenMenu('');setDeleteTarget(account);setConfirmationName('');setDeleteError('');
 };
 const confirmDelete=async()=>{
  if(lock.current||!deleteTarget||confirmationName!==deleteTarget.name)return;lock.current=true;setBusy(true);setDeleteError('');
  try{const target=deleteTarget;if(target.deletedAt)await post(`/users/${encodeURIComponent(target.id)}/release-email`,{confirmationName});else await del(`/users/${encodeURIComponent(target.id)}`,{confirmationName});setDeleteTarget(null);setConfirmationName('');setNotice(target.deletedAt?'Email released for a fresh sign-up. Archived records are retained.':'Account deleted. Booking, package and payment history is retained.');await refreshAfterSave();}catch(failure){setDeleteError(message(failure,'Could not complete this action.'));}finally{lock.current=false;setBusy(false);}
 };
 const actions=(account:Account)=><div className="users-actions">{account.deletedAt?<Button variant="secondary" disabled={busy||emailReleased(account)} onClick={()=>remove(account)}>Release email</Button>:<>
  <Button variant="ghost" aria-label={`View account ${account.name}`} disabled={busy} onClick={()=>view(account)}><Eye size={15} aria-hidden="true"/><span>View</span></Button>
  <Button variant="secondary" aria-label={`Edit account ${account.name}`} disabled={busy} onClick={()=>edit(account)}><Pencil size={15} aria-hidden="true"/><span>Edit</span></Button>
  <CourtActionMenu label="More" triggerAriaLabel={`More actions for ${account.name}`} menuLabel={`Actions for ${account.name}`} variant="secondary" disabled={busy} open={openMenu===account.id} onOpenChange={open=>setOpenMenu(open?account.id:'')}>
   <button role="menuitem" disabled={busy||account.id===user?.id} onClick={()=>void toggle(account)}>{account.active?'Deactivate account':'Activate account'}</button>
   <button role="menuitem" disabled={busy||account.id===user?.id} className="desk-context-menu__destructive" onClick={event=>remove(account,event.currentTarget)}>Delete account</button>
  </CourtActionMenu>
 </>}</div>;
 const invalid=form.name.trim().length<2||(mode==='create'&&(!form.email.trim()||form.password.length<8))||(passwordOpen&&!!form.password&&form.password.length<8);
 const blocked=busy||imageBusy;
 return <Page title="Users" eyebrow="Account management" actions={<Button disabled={busy} onClick={create}><Plus size={16} aria-hidden="true"/>Create account</Button>}><div className="users-page">
  {notice&&<Toast message={notice} onClose={()=>setNotice('')}/>}
  <div className="users-tools"><label className="users-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search users" placeholder="Search name, email or phone" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();setQuery(search.trim());setPage(1);}}}/></label><select aria-label="Account role" value={role} onChange={event=>{setRole(event.target.value);setPage(1);}}><option value="all">All roles</option>{roles.map(value=><option value={value} key={value}>{roleLabel(value)}</option>)}</select><select aria-label="Account status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="current">Current accounts</option><option value="deleted">Deleted accounts</option></select>{(query||role!=='all'||status!=='current')&&<Button variant="ghost" onClick={()=>{setSearch('');setQuery('');setRole('all');setStatus('current');setPage(1);}}>Clear filters</Button>}</div>
  {listError&&<div role="alert" className="users-error"><p>{listError}</p><Button variant="secondary" onClick={()=>setRetry(value=>value+1)}>Retry</Button></div>}
  <h2 className="sr-only" tabIndex={-1} ref={resultsHeading}>User accounts</h2>
  {loading?<div role="status" className="users-loading"><span className="sr-only">Loading accounts…</span>{[0,1,2].map(item=><div key={item} aria-hidden="true"/>)}</div>:users.length?<section className="users-list" aria-label="User accounts"><div className="users-list-columns" aria-hidden="true"><span>Account</span><span>Role</span><span>Status</span><span>Actions</span></div><ul>{users.map(account=><li key={account.id}><article className="users-row" aria-label={`Account ${account.name}`}><div className="users-identity"><Avatar account={account}/><div><h3>{account.name}</h3><p>{contact(account)}</p>{account.phone&&account.email&&!emailReleased(account)&&<p>{account.phone}</p>}</div></div><p className="users-role"><span className="sr-only">Role: </span>{roleLabel(account.role)}</p><State value={account.deletedAt?'Deleted':account.active?'Active':'Inactive'}/>{actions(account)}</article></li>)}</ul></section>:!listError&&<Empty title="No users found" body="Adjust your filters or create an account."/>}
  {hasLoaded&&<HistoryPagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={PAGE_SIZE} noun={pageInfo.total===1?'account':'accounts'} label="User management pagination" disabled={loading||busy} onPage={next=>{paging.current=true;setPage(next);}}/>}
  {(mode==='create'||mode==='edit')&&<DeskDialog title={mode==='create'?'Create account':'Edit account'} eyebrow={mode==='edit'?selected?.name:undefined} onClose={close} busy={blocked} className="users-dialog" closeLabel="Close account form" actions={<Button type="submit" form="user-account-form" loading={busy} disabled={blocked||invalid}>{mode==='create'?'Create account':'Save changes'}</Button>}>
   <form id="user-account-form" onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={blocked} className="users-form">
    <label>Name<input required minLength={2} autoComplete="name" value={form.name} onChange={event=>setForm(current=>({...current,name:event.target.value}))}/></label>
    <label>Email<input required type="email" autoComplete="email" disabled={mode==='edit'} value={form.email} onChange={event=>setForm(current=>({...current,email:event.target.value}))}/></label>
    <label>Phone <span className="users-optional">Optional</span><input type="tel" autoComplete="tel" value={form.phone} onChange={event=>setForm(current=>({...current,phone:event.target.value}))}/></label>
    <label>Role<Select aria-label="Role" value={form.role} onChange={event=>setForm(current=>({...current,role:event.target.value}))}>{roles.map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</Select></label>
    {form.role==='coach'&&<label>Coach department<Select aria-label="Coach department" value={form.coachDepartment} onChange={event=>setForm(current=>({...current,coachDepartment:event.target.value}))}><option>Badminton</option><option>Gym</option></Select></label>}
    {(mode==='create'||passwordOpen)?<label className="users-form-wide">{mode==='create'?'Temporary password':'New password (optional)'}<div className="users-password"><input aria-label={mode==='create'?'Temporary password':'New password (optional)'} type={showPassword?'text':'password'} required={mode==='create'} minLength={8} autoComplete="new-password" value={form.password} onChange={event=>setForm(current=>({...current,password:event.target.value}))}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={16} aria-hidden="true"/>:<Eye size={16} aria-hidden="true"/>}</button></div><span className="users-field-note">{mode==='create'?'At least 8 characters.':'Leave blank to keep the current password.'}</span></label>:<button type="button" className="users-password-link users-form-wide" onClick={()=>setPasswordOpen(true)}><LockKeyhole size={14} aria-hidden="true"/>Set a new password</button>}
    {mode==='edit'&&<label className="users-active users-form-wide"><input type="checkbox" disabled={selected?.id===user?.id} checked={form.active} onChange={event=>setForm(current=>({...current,active:event.target.checked}))}/>Account active</label>}
    {form.role==='coach'&&<details className="users-form-wide users-coach-image"><summary>Coach profile image <span>Optional</span></summary><ImageUpload label="Coach profile image" value={coachImage} onBusyChange={setImageBusy} onChange={value=>{setCoachImage(value);setImageDirty(true);}}/></details>}
   </fieldset></form>{formError&&<p role="alert" className="users-inline-error">{formError}</p>}
  </DeskDialog>}
  {mode==='view'&&selected&&<DeskDialog title="Account details" heading={selected.name} eyebrow={roleLabel(selected.role)} onClose={close} className="users-dialog users-dialog--activity" cancelLabel="Done" closeLabel="Close account details" actions={<Button variant="secondary" onClick={()=>edit(selected)}><Pencil size={14} aria-hidden="true"/>Edit account</Button>}>
   <section className="users-account-profile" aria-label="Account profile"><Avatar account={selected}/><div><p>{contact(selected)}</p>{selected.phone&&selected.email&&<p>{selected.phone}</p>}</div><State value={selected.active?'Active':'Inactive'}/></section>
   <dl className="users-account-dates"><div><dt>Created</dt><dd>{timestamp(selected.createdAt,locale)}</dd></div><div><dt>Last sign-in</dt><dd>{timestamp(selected.lastLoginAt,locale)}</dd></div></dl>
   {activityError?<div role="alert" className="users-error"><p>{activityError}</p><Button variant="secondary" onClick={()=>setActivityRetry(value=>value+1)}>Retry activity</Button></div>:activity?<RecentActivity key={selected.id} activity={activity}/>:<p role="status" className="users-activity-loading">Loading account activity…</p>}<p className="users-timezone">Times shown in Yangon.</p>
  </DeskDialog>}
  {deleteTarget&&<DeskDialog title={deleteTarget.deletedAt?'Release email?':'Delete account?'} eyebrow="Account management" size="compact" className="users-dialog" busy={busy} onClose={()=>{if(!lock.current)setDeleteTarget(null);}} closeLabel="Close account confirmation" actions={<Button variant="danger" loading={busy} disabled={busy||confirmationName!==deleteTarget.name} onClick={()=>void confirmDelete()}>{deleteTarget.deletedAt?<ShieldCheck size={15} aria-hidden="true"/>:<Trash2 size={15} aria-hidden="true"/>}{deleteTarget.deletedAt?'Release email':'Delete account'}</Button>}>
   <div className="users-delete-identity"><Avatar account={deleteTarget}/><div><strong>{deleteTarget.name}</strong><p>{contact(deleteTarget)}</p></div></div><p className="users-delete-note">{deleteTarget.deletedAt?'Allows a fresh sign-up with this email. Original sign-in identities and history stay attached to the archived account.':'Sign-in will be disabled. Existing bookings, packages and payments stay in history.'}</p><label className="users-confirm-name">Type the full name to confirm<input aria-label="Type the full name to confirm" autoComplete="off" value={confirmationName} placeholder={deleteTarget.name} disabled={busy} onChange={event=>{setConfirmationName(event.target.value);setDeleteError('');}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void confirmDelete();}}}/></label>{deleteError&&<p role="alert" className="users-inline-error">{deleteError}</p>}
  </DeskDialog>}
 </div></Page>;
}
