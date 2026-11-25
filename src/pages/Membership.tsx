import { SegmentedControl } from '../components/Interactions';
import { DeskDialog } from '../components/court-desk/DeskDialog';
import { mediaImageSrc } from '../components/ImageUpload';
import { badmintonDaysLabel, badmintonWeekdays } from '../components/BadmintonAvailableDays';
import { startPayment } from '../services/paymentFlow';
import { categoryLabel } from '../components/BadmintonCategoryField';
import { bookingClock } from '../utils/bookingTime';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Minus, Package, RotateCw } from 'lucide-react';
import { Button, Page } from '../components/UI';
import { get, post } from '../api';
import './membership.css';

type Offer={id:string;title:string;status:string;sessions:number;validity:number;price:number;description:string;availableDays?:string[];availableFrom?:string;availableUntil?:string;scheduleNotes?:string;courtRules?:string;imageUrl?:string;category?:{name:string;code:string;active:boolean}|null};
type Enrollment={id:string;packageId:string;packageName:string;categoryCode:string|null;status:string;startDate:string;expiryDate:string;sessionsRemaining:number;sessionsTotal:number};
type Purchase={id:string;packageId:string;status:string};
type Quote={revision:string;packageName:string;newSessions:number;carriedSessions:number;totalSessions:number;price:number;startDate:string;expiryDate:string};
const dateLabel=(date:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00`));
function PackageDays({days}:{days?:string[]}){
 const unrestricted=!badmintonWeekdays.some(day=>days?.includes(day));
 return <div className="membership-store-days"><p>Available days{unrestricted&&<span>Every day</span>}</p><ul aria-label="Weekly package availability">{badmintonWeekdays.map(day=>{
  const available=unrestricted||!!days?.includes(day);
  return <li key={day} data-available={available} aria-label={`${day}: ${available?'Available':'Unavailable'}`}><span>{day}</span>{available?<Check size={12} strokeWidth={2.5} aria-hidden="true"/>:<Minus size={12} aria-hidden="true"/>}</li>;
 })}</ul></div>;
}
export function Membership(){
 const [tab,setTab]=useState<'active'|'store'>('active'),[packages,setPackages]=useState<Offer[]>([]),[enrollments,setEnrollments]=useState<Enrollment[]>([]),[purchases,setPurchases]=useState<Purchase[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[selected,setSelected]=useState<Offer|null>(null),[renewal,setRenewal]=useState<Enrollment|null>(null),[quote,setQuote]=useState<Quote|null>(null),[quoting,setQuoting]=useState(false),[retry,setRetry]=useState(0);
 const lock=useRef(false),keys=useRef(new Map<string,string>()),generation=useRef(0),quoteGeneration=useRef(0);
 const revision=useBookingRevision();
 const invalidate=useCallback(()=>{++generation.current;},[]);
 const load=useCallback(async()=>{const version=++generation.current;const data=await get<{packages:Offer[];enrollments:Enrollment[];purchases:Purchase[]}>('/member/dashboard');if(version===generation.current){setPackages(data.packages||[]);setEnrollments(data.enrollments||[]);setPurchases(data.purchases||[]);}},[]);
 useEffect(()=>{let live=true;void load().then(()=>{if(live)setError('');}).catch(()=>{if(live)setError('Your packages could not refresh. Please try again.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;invalidate();};},[load,revision,retry,invalidate]);
 const today=bookingClock().date;
 const active=enrollments.filter(row=>row.status==='active'&&row.startDate<=today&&row.expiryDate>=today&&row.sessionsRemaining>0);
 const store=packages.filter(row=>row.status==='active'&&row.category?.active!==false&&!!row.category?.code);
 const keyFor=(id:string)=>{let key=keys.current.get(id);if(!key){key=crypto.randomUUID();keys.current.set(id,key);}return key;};
 const close=()=>{if(lock.current)return;++quoteGeneration.current;setSelected(null);setRenewal(null);setQuote(null);setError('');};
 const reviewRenewal=async(row:Enrollment)=>{if(lock.current)return;const version=++quoteGeneration.current;setRenewal(row);setQuote(null);setError('');setQuoting(true);try{const result=await get<Quote>(`/member/badminton-enrollments/${encodeURIComponent(row.id)}/renewal`);if(version===quoteGeneration.current)setQuote(result);}catch(failure){if(version===quoteGeneration.current)setError(failure instanceof Error?failure.message:'Renewal could not be loaded.');}finally{if(version===quoteGeneration.current)setQuoting(false);}};
 const confirm=async()=>{
  if(lock.current||(!selected&&!quote)||quoting)return;lock.current=true;setBusy(true);setError('');
  try{
   if(renewal&&quote){await post(`/member/badminton-enrollments/${encodeURIComponent(renewal.id)}/renew`,{confirmed:true,requestKey:keyFor(`renew:${renewal.id}`),revision:quote.revision});setNotice(`Package renewed. ${quote.carriedSessions} sessions carried over; ${quote.totalSessions} sessions ready to use.`);}
   else if(selected){const pending=purchases.find(row=>row.packageId===selected.id&&['PENDING','AWAITING_PAYMENT'].includes(row.status));if(pending)await startPayment('/payments/confirm',{resourceType:'badminton_package',resourceId:pending.id});else await post(`/member/badminton-packages/${selected.id}/purchase`,{confirmed:true,requestKey:keyFor(`buy:${selected.id}`)});setNotice(`${selected.title} is active and ready to use.`);}
   await load();if(selected)keys.current.delete(`buy:${selected.id}`);setSelected(null);setRenewal(null);setQuote(null);setTab('active');
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not save your package. Please retry.');if(renewal&&(failure as {status?:number}).status===409)setQuote(null);}
  finally{lock.current=false;setBusy(false);}
 };
 const modal=selected||renewal;
 const ownedSelected=selected?active.find(row=>row.packageId===selected.id):undefined;
 return <Page title="Membership" eyebrow="Your badminton packages"><div className="membership-page">
  <SegmentedControl label="Membership sections" value={tab} onChange={setTab} options={[{value:'active',label:'Active Packages'},{value:'store',label:'Package Store'}]}/>
  {notice&&<p role="status" className="membership-success">{notice}</p>}
  {error&&!modal&&<p role="alert" className="membership-error">{error}<button onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
  {loading?<div role="status" className="membership-loading">Loading your packages…</div>:tab==='active'?<section aria-label="Active packages">
   <div className="membership-section-heading"><p>Your sessions, ready to use.</p><div><Link to="/attendance">Check-in history <ArrowUpRight size={14} aria-hidden="true"/></Link>{active.length>0&&<Link to="/check-in" className="membership-check-in">Scan to check in</Link>}</div></div>
   {active.length?<div className="membership-grid">{active.map(row=><article className="membership-active-card" key={row.id}>
    <header><div><p>{categoryLabel(row.categoryCode)}</p><h2>{row.packageName}</h2></div><span className="membership-status">Active</span></header>
    <div className="membership-balance"><div role="img" aria-label={`${row.sessionsRemaining} of ${row.sessionsTotal} sessions remaining`} className="membership-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" className="membership-ring-track"/><circle cx="50" cy="50" r="43" className="membership-ring-fill" pathLength="100" strokeDasharray={`${Math.min(100,row.sessionsRemaining/Math.max(1,row.sessionsTotal)*100)} 100`}/></svg><strong>{row.sessionsRemaining}</strong></div><div><p>Sessions left</p><span>Valid until {dateLabel(row.expiryDate)}</span></div></div>
    <Button variant="secondary" className="w-full" disabled={busy} onClick={()=>void reviewRenewal(row)}><RotateCw size={15} aria-hidden="true"/>Renew package</Button>
   </article>)}</div>:<div className="membership-empty"><Package size={32} strokeWidth={1.3} aria-hidden="true"/><h2>No active packages</h2><p>Choose a package to start your next sessions.</p><Button onClick={()=>setTab('store')}>Browse packages</Button></div>}
  </section>:<section aria-label="Package store"><div className="membership-section-heading"><p>Choose the sessions that suit you.</p></div>{store.length?<div className="membership-grid">{store.map(row=><article className="membership-store-card" key={row.id}>
   {row.imageUrl&&<img src={mediaImageSrc(row.imageUrl)} alt=""/>}<p className="membership-category">{row.category?.name}</p><h2>{row.title}</h2><p className="membership-offer-facts">{row.sessions} sessions <span>·</span> {row.validity} days</p><PackageDays days={row.availableDays}/><p className="membership-price">{row.price.toLocaleString()} <small>MMK</small></p><Button variant="secondary" className="w-full" aria-label={`View details for ${row.title}`} onClick={()=>{setError('');setSelected(row);}}>View details <ArrowUpRight size={14} aria-hidden="true"/></Button>
  </article>)}</div>:<div className="membership-empty"><Package size={32} aria-hidden="true"/><h2>No packages available</h2><p>Please check again later.</p></div>}</section>}
  {modal&&<DeskDialog title={renewal?'Renew package':`${selected!.title} details`} heading={renewal?renewal.packageName:selected!.title} eyebrow={renewal?'Package renewal':selected?.category?.name||'Badminton package'} onClose={close} closeLabel="Close package details" cancelLabel="Back to packages" busy={busy} className="membership-dialog" summary={(quote||selected)&&<div className="membership-payment"><span>{renewal?'Renewal total':'Package price'}</span><strong>{(quote?.price??selected!.price).toLocaleString()} <small>MMK</small></strong></div>} actions={<Button loading={busy} disabled={busy||quoting||!!renewal&&!quote} onClick={()=>{if(ownedSelected){close();setTab('active');}else void confirm();}}>{busy?'Saving…':renewal?'Confirm renewal':ownedSelected?'View active package':'Activate package'}</Button>}>
   {renewal?(quoting?<p role="status">Checking your balance…</p>:quote?<><div className="membership-renewal-equation"><div><span>Carried over</span><strong>{quote.carriedSessions}</strong></div><b aria-hidden="true">+</b><div><span>New sessions</span><strong>{quote.newSessions}</strong></div><b aria-hidden="true">=</b><div><span>Ready to use</span><strong>{quote.totalSessions}</strong></div></div><p className="membership-renewal-period">Valid {dateLabel(quote.startDate)} – {dateLabel(quote.expiryDate)}</p><p className="membership-dialog-note">Renewal starts a new validity period today. Your unused eligible sessions move into this package.</p></>:null):<><p className="membership-dialog-facts">{selected!.sessions} sessions · {selected!.validity} days</p><p className="membership-dialog-days"><strong>Available days</strong><span>{badmintonDaysLabel(selected!.availableDays)}</span>{(selected!.availableFrom||selected!.availableUntil)&&<span>{selected!.availableFrom} – {selected!.availableUntil}</span>}</p>{selected!.description&&<p className="membership-description">{selected!.description}</p>}{selected!.scheduleNotes&&<p className="membership-dialog-note">{selected!.scheduleNotes}</p>}{selected!.courtRules&&<p className="membership-dialog-note">{selected!.courtRules}</p>}</>}
   {error&&<p role="alert" className="membership-error">{error}</p>}{renewal&&!quote&&!quoting&&<Button variant="secondary" onClick={()=>void reviewRenewal(renewal)}>Refresh renewal</Button>}
   <p className="membership-simulation">Payment is simulated. No money is charged.</p>
  </DeskDialog>}
 </div></Page>;
}
