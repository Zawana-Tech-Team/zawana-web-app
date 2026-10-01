import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Pencil, Trash2, MapPinned, CalendarDays, UserRound,
  ShieldCheck, Wrench, Clock3, Sparkles, Search, Power, MoreHorizontal
} from "lucide-react";
import { Card, Page, Button, Badge, Toast } from "../components/UI";
import { get, post, patch, del } from "../api";

type Section = "courts" | "coaches" | "schedules";

function Modal({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:React.ReactNode;onClose:()=>void}){
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zawana-950/55 p-4 backdrop-blur-md" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/50 bg-white shadow-[0_35px_100px_rgba(29,27,71,.28)]">
   <div className="relative overflow-hidden bg-zawana-950 px-6 py-5 text-white">
    <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full border border-zawana-gold/30"/>
    <div className="relative flex items-start justify-between gap-4">
     <div><p className="eyebrow text-zawana-gold">Zawana control</p><h3 className="mt-1 text-2xl font-black tracking-tight">{title}</h3>{subtitle&&<p className="mt-1 text-sm text-white/55">{subtitle}</p>}</div>
     <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X size={18}/></button>
    </div>
   </div>
   <div className="max-h-[75vh] overflow-y-auto p-6">{children}</div>
  </div>
 </div>
}
const Field=({label,...p}:any)=><label className="block space-y-1.5 text-sm"><span className="text-[11px] font-black uppercase tracking-wider text-zawana-500">{label}</span><input {...p} className="w-full"/></label>;
const SelectField=({label,children,...p}:any)=><label className="block space-y-1.5 text-sm"><span className="text-[11px] font-black uppercase tracking-wider text-zawana-500">{label}</span><select {...p}>{children}</select></label>;

function ConfirmDelete({name,onCancel,onConfirm}:{name:string;onCancel:()=>void;onConfirm:()=>void}){
 return <Modal title="Delete record?" subtitle="This action cannot be undone." onClose={onCancel}>
  <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-800"><b>{name}</b> will be permanently removed.</div>
  <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Keep it</Button><Button variant="danger" onClick={onConfirm}><Trash2 size={15}/> Delete</Button></div>
 </Modal>
}

export function AdminManagement({section}:{section:Section}){
 const [rows,setRows]=useState<any[]>([]); const [open,setOpen]=useState(false); const [editing,setEditing]=useState<any>(null);
 const [coaches,setCoaches]=useState<any[]>([]);
 const [coachAccounts,setCoachAccounts]=useState<any[]>([]);
 const [deleting,setDeleting]=useState<any>(null); const [query,setQuery]=useState(""); const [saving,setSaving]=useState(false);
 const [form,setForm]=useState<any>({}); const [notice,setNotice]=useState("");
 const notify=(m:string)=>{setNotice(m);setTimeout(()=>setNotice(""),2500)};
 const load=()=>get<any[]>(`/${section}`).then(setRows);
 useEffect(()=>{load()},[section]);
 useEffect(()=>{if(section==='schedules')get<any[]>('/coaches').then(setCoaches).catch(()=>setCoaches([]))},[section]);
 useEffect(()=>{if(section==='coaches')get<any[]>('/users').then(users=>setCoachAccounts(users.filter((u:any)=>u.role==='coach'))).catch(()=>setCoachAccounts([]))},[section]);

 const start=(row?:any)=>{
  setEditing(row||null);
  setForm(row?{...row,features:Array.isArray(row.features)?row.features.join(", "):row.features||""}:
   section==="courts"?{name:"",type:"Standard",surface:"Premium",price:15000,status:"available",features:"LED lighting, Air conditioned"}:
   section==="coaches"?{name:"",specialty:"Badminton",phone:"",email:"",status:"active",color:"#D6FF3F"}:
   {person:"",role:"coach",day:"Monday",start:"08:00",end:"10:00",service:"General",active:true});
  setOpen(true);
 };
 const save=async()=>{
  setSaving(true);
  try{
   const payload=section==="courts"
    ? {...form,price:Number(form.price),features:String(form.features||"").split(",").map((x:string)=>x.trim()).filter(Boolean)}
    : section==="coaches"?form:{...form,active:Boolean(form.active)};
   if(editing) { await patch(`/${section}/${editing.id}`,payload); notify(`${titleFor(section)} updated successfully.`); }
   else { await post(`/${section}`,payload); notify(`${titleFor(section)} created successfully.`); }
   await load(); setOpen(false);
  } catch(e:any) { notify(e.message||"Could not save record."); } finally {setSaving(false)}
 };
 const remove=async()=>{if(!deleting)return;try{await del(`/${section}/${deleting.id}`);setDeleting(null);await load();notify(`${titleFor(section)} deleted successfully.`)}catch(e:any){notify(e.message||"Could not delete record.")}};
 const filtered=useMemo(()=>rows.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),[rows,query]);
 const title=section==="courts"?"Courts":section==="coaches"?"Coaches":"Schedules";
 const titleFor=(s:Section)=>s==="courts"?"Court":s==="coaches"?"Coach":"Schedule";
 const icon=section==="courts"?<MapPinned/>:section==="coaches"?<UserRound/>:<CalendarDays/>;

 return <Page title={`${title} management`} eyebrow="Administration" actions={<Button onClick={()=>start()}><Plus size={16}/> Add {title.slice(0,-1).toLowerCase()}</Button>}>
  {notice&&<Toast message={notice} onClose={()=>setNotice("")}/>}
  <div className="mb-6 flex flex-col gap-3 md:flex-row">
   <div className="relative flex-1"><Search size={16} className="absolute left-4 top-3.5 text-zawana-500"/><input className="pl-10" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="flex items-center gap-2 rounded-2xl bg-zawana-900 px-4 text-xs font-bold text-zawana-500"><ShieldCheck size={15}/> Live operational controls</div>
  </div>

  {section==="courts" ?
   <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map(r=><CourtCard key={r.id} row={r} onEdit={()=>start(r)} onDelete={()=>setDeleting(r)}/>)}</div>
   : <div className="grid gap-4 lg:grid-cols-2">{filtered.map(r=><Card key={r.id} className="group overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zawana-900">{section==="coaches"?<UserRound size={19}/>:<CalendarDays size={19}/>}</div><div><p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">{section==="coaches"?r.specialty:r.role}</p><h3 className="text-lg font-black">{section==="coaches"?r.name:r.person}</h3><p className="mt-1 text-xs text-zawana-500">{section==="coaches"?`${r.email} · ${r.phone}`:`${r.day} · ${r.start}–${r.end} · ${r.service||"General"}`}</p></div></div>
       <div className="flex gap-1"><button className="rounded-xl p-2 hover:bg-zawana-900" onClick={()=>start(r)}><Pencil size={15}/></button><button className="rounded-xl p-2 text-red-600 hover:bg-red-50" onClick={()=>setDeleting(r)}><Trash2 size={15}/></button></div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-zawana-950/8 pt-4"><Badge good={section==="coaches"?r.status==="active":r.active}>{section==="coaches"?r.status:(r.active?"active":"inactive")}</Badge>{section==="schedules"&&<span className="text-xs font-bold text-zawana-500"><Clock3 size={13} className="mr-1 inline"/>weekly block</span>}</div>
    </Card>)}</div>}

  {!filtered.length&&<Card className="p-12 text-center"><Sparkles className="mx-auto text-zawana-gold"/><h3 className="mt-3 font-black">Nothing here yet</h3><p className="mt-1 text-sm text-zawana-500">Create your first {title.toLowerCase().slice(0,-1)} to start managing the facility.</p></Card>}

  {open&&<Modal title={`${editing?"Edit":"Create"} ${section==="courts"?"court":section==="coaches"?"coach":"schedule"}`} subtitle={section==="courts"?"Set the commercial data and operational availability.":"Keep schedules and people centrally controlled."} onClose={()=>setOpen(false)}>
   <div className="grid gap-4 md:grid-cols-2">
    {section==="courts"&&<><Field label="Court name" value={form.name||""} onChange={(e:any)=>setForm({...form,name:e.target.value})} placeholder="Court 07"/><SelectField label="Court type" value={form.type||"Standard"} onChange={(e:any)=>setForm({...form,type:e.target.value})}><option>Standard</option><option>Premium</option></SelectField><Field label="Surface" value={form.surface||""} onChange={(e:any)=>setForm({...form,surface:e.target.value})} placeholder="Yonex PVC"/><Field label="Price / session" type="number" value={form.price??""} onChange={(e:any)=>setForm({...form,price:e.target.value})}/><Field label="Features" value={form.features||""} onChange={(e:any)=>setForm({...form,features:e.target.value})} placeholder="LED, AC, Pro flooring"/><SelectField label="Operational status" value={form.status||"available"} onChange={(e:any)=>setForm({...form,status:e.target.value})}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></SelectField></>}
    {section==="coaches"&&<><Field label="Name" value={form.name||""} onChange={(e:any)=>setForm({...form,name:e.target.value})}/><Field label="Specialty" value={form.specialty||""} onChange={(e:any)=>setForm({...form,specialty:e.target.value})}/><Field label="Phone" value={form.phone||""} onChange={(e:any)=>setForm({...form,phone:e.target.value})}/><SelectField label="Coach login account" value={form.email||""} onChange={(e:any)=>setForm({...form,email:e.target.value})}><option value="">No linked coach login</option>{coachAccounts.map((u:any)=><option key={u.id} value={u.email}>{u.name} · {u.email}</option>)}</SelectField><p className="-mt-2 text-xs leading-5 text-zawana-500 md:col-span-2">Link this profile to the matching user account with the Coach role. Only linked coaches can receive private-course requests and appear as selectable coaches.</p><SelectField label="Status" value={form.status||"active"} onChange={(e:any)=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></SelectField></>}
   {section==="schedules"&&<><SelectField label="Role" value={form.role||"coach"} onChange={(e:any)=>setForm({...form,role:e.target.value,coachId:e.target.value==='coach'?form.coachId:'',person:e.target.value==='coach'?form.person:''})}><option value="coach">Coach</option><option value="doctor">Doctor</option></SelectField>{form.role==='coach'?<SelectField label="Coach" value={form.coachId||''} onChange={(e:any)=>{const selected=coaches.find(c=>c.id===e.target.value);setForm({...form,coachId:e.target.value,person:selected?.name||'',service:'Badminton'})}}><option value="">Select a coach</option>{coaches.map(c=><option key={c.id} value={c.id}>{c.name} · {c.specialty}</option>)}</SelectField>:<Field label="Person" value={form.person||""} onChange={(e:any)=>setForm({...form,person:e.target.value})}/>}<SelectField label="Day" value={form.day||"Monday"} onChange={(e:any)=>setForm({...form,day:e.target.value})}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d=><option key={d}>{d}</option>)}</SelectField><Field label="Start" type="time" value={form.start||""} onChange={(e:any)=>setForm({...form,start:e.target.value})}/><Field label="End" type="time" value={form.end||""} onChange={(e:any)=>setForm({...form,end:e.target.value})}/><Field label="Service" value={form.service||""} onChange={(e:any)=>setForm({...form,service:e.target.value})}/></>}
   </div>
   <div className="mt-6 flex justify-end gap-2 border-t border-zawana-950/8 pt-5"><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={saving} onClick={save}>{saving?"Saving…":editing?"Save changes":"Create record"}</Button></div>
  </Modal>}
  {deleting&&<ConfirmDelete name={section==="schedules"?deleting.person:deleting.name} onCancel={()=>setDeleting(null)} onConfirm={remove}/>}
 </Page>
}

function CourtCard({row,onEdit,onDelete}:{row:any;onEdit:()=>void;onDelete:()=>void}){
 const unavailable=row.status!=="available";
 return <Card className="group relative overflow-hidden p-0 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(29,27,71,.12)]">
  <div className="court-lines relative min-h-[190px] overflow-hidden bg-zawana-950 p-5 text-white">
   <div className="absolute right-4 top-4 flex gap-1"><button onClick={onEdit} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Pencil size={14}/></button><button onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-full bg-red-500/15 text-red-200 hover:bg-red-500/25"><Trash2 size={14}/></button></div>
   <div className="absolute bottom-5 left-5"><p className="eyebrow text-zawana-gold">{row.type} COURT</p><h3 className="mt-1 text-2xl font-black">{row.name}</h3><p className="mt-1 text-xs text-white/55">{row.surface} · {Number(row.price).toLocaleString()} MMK / session</p></div>
   <div className="absolute left-1/2 top-1/2 h-24 w-px bg-white/15"/><div className="absolute inset-x-[18%] top-1/2 h-px bg-white/15"/>
  </div>
  <div className="p-5"><div className="flex items-center justify-between"><Badge good={!unavailable}>{unavailable?<><Wrench size={11}/> {row.status}</>:<><Power size={11}/> bookable</>}</Badge><span className="text-[10px] font-black uppercase tracking-wider text-zawana-500">{(row.features||[]).length} features</span></div><p className="mt-3 text-xs text-zawana-500">{(row.features||[]).join(" · ")||"Configured facility"}</p></div>
 </Card>
}
