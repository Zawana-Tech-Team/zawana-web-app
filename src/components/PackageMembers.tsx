import type { BadmintonCategory } from './BadmintonCategoryField';
import { useEffect, useState } from 'react';
import { get } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { DeskDialog } from './court-desk/DeskDialog';
import { Button } from './UI';
type MemberRow={id:string;packageName:string;categoryCode:string|null;sessionsRemaining:number;startDate:string;expiryDate:string;status:string;member:{id:string|null;name:string;email:string|null;phone:string|null}};
type Result={total:number;page:number;pageSize:number;rows:MemberRow[]};
export function PackageMembers({packageId,name}:{packageId:string;name:string}){
 const[open,setOpen]=useState(false);
 return <><Button variant="secondary" onClick={()=>setOpen(true)}>Active Members</Button>{open&&<MemberList key={packageId} packageId={packageId} name={name} onClose={()=>setOpen(false)}/>}</>;
}
function MemberList({packageId,name,onClose}:{packageId:string;name:string;onClose:()=>void}){
 const[categories,setCategories]=useState<BadmintonCategory[]>([]),[categoryCode,setCategoryCode]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('active'),[page,setPage]=useState(1),[data,setData]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const revision=useBookingRevision();
 useEffect(()=>{let live=true;void get<BadmintonCategory[]>('/packages/badminton/categories').then(rows=>{if(live)setCategories(rows);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 useEffect(()=>{let live=true;setLoading(true);setError('');const timer=setTimeout(()=>{const params=new URLSearchParams({page:String(page),pageSize:'25',q:query,status,...(categoryCode?{categoryCode}:{})});void get<Result>(`/packages/badminton/${packageId}/members?${params}`).then(rows=>{if(live){const lastPage=Math.max(1,Math.ceil(rows.total/rows.pageSize));if(page>lastPage)setPage(lastPage);else setData(rows);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});},200);return()=>{live=false;clearTimeout(timer);};},[packageId,page,query,status,categoryCode,revision]);
 return <DeskDialog title="Package members" heading={name} description="Package memberships and current session balances." onClose={onClose} cancelLabel="Close" bodyClassName="space-y-4">
 <div className="grid gap-3 sm:grid-cols-3"><label>Search members<input aria-label="Search package members" placeholder="Name, phone or email" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><label>Membership status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="active">Active members</option><option value="expired">Expired</option><option value="all">All memberships</option></select></label><label>Category<select aria-label="Member package category" value={categoryCode} onChange={e=>{setCategoryCode(e.target.value);setPage(1);}}><option value="">All categories</option>{categories.filter(c=>c.code).map(c=><option key={c.id} value={c.code!}>{c.name}{c.active?'':' (archived)'}</option>)}</select></label></div>
 {loading&&<p role="status">{data?'Updating members…':'Loading members…'}</p>}{error&&<p role="alert">{error}</p>}{!error&&data&&<><p className="text-sm">{data.total} memberships</p>{!data.rows.length&&<p>No matching members.</p>}<ul className="divide-y">{data.rows.map(row=><li key={row.id} className="py-4"><details><summary className="cursor-pointer min-h-11"><strong>{row.member.name}</strong><span className="ml-3 text-sm">{row.sessionsRemaining} sessions · {row.status}</span></summary><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{[['Phone',row.member.phone||'Not provided'],['Email',row.member.email||'Not provided'],['Package',row.packageName],['Category',categories.find(c=>c.code===row.categoryCode)?.name||row.categoryCode||'Needs review'],['Activation date',row.startDate],['Expiration date',row.expiryDate]].map(([label,value])=><div key={label}><dt className="text-zawana-500">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl></details></li>)}</ul><div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><Button variant="secondary" disabled={page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)}>Next</Button></div></>}
 </DeskDialog>;
}

/** FO keeps activation and member lookup separate while sharing the same member dialog. */
export function PackageMemberDirectory({packages}:{packages:{id:string;title:string;status:string;category?:{name:string}|null}[]}){
 const [selected,setSelected]=useState('');
 const current=packages.find(p=>p.id===selected)||packages[0];
 return <section className="mb-6 rounded-2xl border border-zawana-border bg-white p-5" aria-label="Package member directory"><h2 className="text-lg font-semibold">Package members</h2><p className="mt-1 text-sm text-zawana-500">View contact details, session balances and membership dates.</p>{current?<div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Package<select aria-label="Package for member details" value={current.id} onChange={e=>setSelected(e.target.value)}>{packages.map(p=><option key={p.id} value={p.id}>{p.title}{p.category?` · ${p.category.name}`:''}{p.status==='active'?'':` · ${p.status}`}</option>)}</select></label><PackageMembers key={current.id} packageId={current.id} name={current.title}/></div>:<p className="mt-4 text-sm text-zawana-500">No packages to display.</p>}</section>;
}
