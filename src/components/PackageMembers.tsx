import './badminton-package-management.css';
import { useEffect, useState } from 'react';
import { get } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { DeskDialog } from './court-desk/DeskDialog';
import { Button } from './UI';
export function PackageMembers({packageId,name}:{packageId:string;name:string}){
 const[open,setOpen]=useState(false);
 return <><Button variant="secondary" onClick={()=>setOpen(true)}>Active students</Button>{open&&<MemberList key={packageId} packageId={packageId} name={name} onClose={()=>setOpen(false)}/>}</>;
}
function MemberList({packageId,name,onClose}:{packageId:string;name:string;onClose:()=>void}){
 const [page,setPage]=useState(1),[data,setData]=useState<{total:number;page:number;pageSize:number;rows:{id:string;name:string}[]}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const revision=useBookingRevision();
 useEffect(()=>{let live=true;setLoading(true);setError('');void get<{total:number;page:number;pageSize:number;rows:{id:string;name:string}[]}>(`/packages/badminton/${encodeURIComponent(packageId)}/active-students?page=${page}&pageSize=25`).then(result=>{if(!live)return;const last=Math.max(1,Math.ceil(result.total/result.pageSize));if(page>last)setPage(last);else setData(result);}).catch(error=>{if(live)setError(error instanceof Error?error.message:'Could not load active students.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[packageId,page,revision,retry]);
 return <DeskDialog title="Active students" heading={name} eyebrow="Active students" size="compact" onClose={onClose} cancelLabel="Close" className="package-students-dialog" bodyClassName="space-y-4">
 {error?<div role="alert"><p>{error}</p><Button variant="secondary" onClick={()=>setRetry(value=>value+1)}>Retry students</Button></div>:loading?<p role="status">Loading active students…</p>:data&&<><p className="package-students-count"><strong>{data.total}</strong><span>active {data.total===1?'student':'students'}</span></p>{!data.rows.length?<p className="text-sm text-zawana-500">No active students in this package.</p>:<ul className="package-students-list">{data.rows.map(student=><li key={student.id}>{student.name}</li>)}</ul>}{data.total>data.pageSize&&<div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(value=>value-1)}>Previous</Button><span className="text-xs">{page} / {Math.ceil(data.total/data.pageSize)}</span><Button variant="secondary" disabled={page*data.pageSize>=data.total} onClick={()=>setPage(value=>value+1)}>Next</Button></div>}</>}
 </DeskDialog>;
}

/** FO keeps activation and member lookup separate while sharing the same member dialog. */
export function PackageMemberDirectory({packages}:{packages:{id:string;title:string;status:string;category?:{name:string}|null}[]}){
 const [selected,setSelected]=useState('');
 const current=packages.find(p=>p.id===selected)||packages[0];
 return <section className="mb-6 rounded-2xl border border-zawana-border bg-white p-5" aria-label="Package member directory"><h2 className="text-lg font-semibold">Package members</h2><p className="mt-1 text-sm text-zawana-500">View active student names and totals by package.</p>{current?<div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Package<select aria-label="Package for member details" value={current.id} onChange={e=>setSelected(e.target.value)}>{packages.map(p=><option key={p.id} value={p.id}>{p.title}{p.category?` · ${p.category.name}`:''}{p.status==='active'?'':` · ${p.status}`}</option>)}</select></label><PackageMembers key={current.id} packageId={current.id} name={current.title}/></div>:<p className="mt-4 text-sm text-zawana-500">No packages to display.</p>}</section>;
}
