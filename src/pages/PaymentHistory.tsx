import { useEffect, useRef, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, CircleX, Clock3, CreditCard, Hourglass, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { usePaymentRevision } from '../hooks/usePaymentRevision';
import { useLanguage } from '../context/LanguageContext';
import { Select } from '../components/Select';
import { Button, Empty, Page } from '../components/UI';
import { HistoryPagination } from '../components/member-booking/HistoryPagination';
import { formatBookingDate } from '../utils/bookingDates';
import { get } from '../api';
import './payment-history.css';

type Transaction={id:string;date:string;createdAt?:string|null;item:string;business:string;category?:string|null;finalAmount:number;status:string;confirmationMode?:string;paymentMethod:string};
type PaymentPage={data:Transaction[];pagination:{page:number;limit:number;total:number;totalPages:number}};
const PAGE_SIZE=10;
const EMPTY:PaymentPage={data:[],pagination:{page:1,limit:PAGE_SIZE,total:0,totalPages:0}};
const stateLabel=(status:string)=>({paid:'Paid',pending:'Pending',refunded:'Refunded',failed:'Failed',cancelled:'Cancelled'} as Record<string,string>)[status.toLowerCase()]||status.replaceAll('_',' ');
function recordedTime(value:string|null|undefined,date:string,locale:string){
 if(!value)return null;
 const recorded=new Date(value);if(!Number.isFinite(recorded.getTime()))return null;
 const sameDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yangon',year:'numeric',month:'2-digit',day:'2-digit'}).format(recorded)===date;
 return new Intl.DateTimeFormat(locale,{timeZone:'Asia/Yangon',...(sameDate?{}:{day:'numeric',month:'short',year:'numeric'}),hour:'numeric',minute:'2-digit'}).format(recorded);
}
function PaymentCard({row}:{row:Transaction}){
 const {locale}=useLanguage();
 const state=row.status.toLowerCase(),simulated=row.confirmationMode==='SIMULATED'||/simulated/i.test(row.paymentMethod);
 const cash=/^cash$/i.test(row.paymentMethod),method=simulated?'Simulated payment':cash?'Cash':row.paymentMethod;
 const Icon=state==='paid'?CheckCircle2:state==='refunded'?RotateCcw:state==='failed'||state==='cancelled'?CircleX:Hourglass;
 const time=recordedTime(row.createdAt,row.date,locale);
 const date=(options:Intl.DateTimeFormatOptions)=>formatBookingDate(row.date,options,locale);
 return <article className="payment-history-card" data-status={state}>
  <div className="payment-history-card-summary">
   <span className="payment-history-date" role="img" aria-label={`Receipt date ${date({day:'numeric',month:'long',year:'numeric'})}`}><span aria-hidden="true">{date({month:'short'})}</span><strong aria-hidden="true">{date({day:'2-digit'})}</strong><small aria-hidden="true">{date({year:'numeric'})}</small></span>
   <div className="payment-history-main"><p className="payment-history-category">{row.category||row.business}</p><h2>{row.item}</h2><p className="payment-history-time"><Clock3 size={14} aria-hidden="true"/>{time?<>Recorded <time dateTime={row.createdAt!}>{time}</time></>:'Time not recorded'}</p><p className="payment-history-method">{cash?<Banknote size={14} aria-hidden="true"/>:<CreditCard size={14} aria-hidden="true"/>}{method}{simulated&&<span>· No external charge</span>}</p></div>
   <div className="payment-history-value"><p><strong>{Number(row.finalAmount).toLocaleString(locale)}</strong><span>MMK</span></p><span className="payment-history-state" data-status={state}><Icon size={14} aria-hidden="true"/>{stateLabel(row.status)}</span></div>
  </div>
  <details className="payment-history-details"><summary>Receipt details<ChevronDown size={15} aria-hidden="true"/></summary><dl><dt>Receipt reference</dt><dd>{row.id}</dd></dl></details>
 </article>;
}

export default function PaymentHistory(){
 const revision=usePaymentRevision();
 const [result,setResult]=useState<PaymentPage>(EMPTY),[loading,setLoading]=useState(true),[error,setError]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[filters,setFilters]=useState({status:'',from:'',to:''});
 const lastQuery=useRef(''),paging=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{const next=search.trim();if(next===query)return;const timer=setTimeout(()=>{setPage(1);setQuery(next);},250);return()=>clearTimeout(timer);},[search,query]);
 useEffect(()=>{
  let live=true;
  const params=new URLSearchParams({page:String(page),limit:String(PAGE_SIZE)});
  if(query)params.set('q',query);for(const [key,value] of Object.entries(filters))if(value)params.set(key,value);
  const key=params.toString();if(lastQuery.current!==key){setLoading(true);lastQuery.current=key;}
  void get<PaymentPage>(`/transactions?${params}`).then(data=>{
   if(!live)return;
   const pagination={...EMPTY.pagination,...data.pagination,page:data.pagination?.page||page};
   const last=Math.max(1,pagination.totalPages);if(page>last){setPage(last);return;}
   setResult({data:data.data||[],pagination});setError('');
  }).catch(failure=>{if(live)setError(failure instanceof Error?failure.message:'Could not load your payment history.');}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[page,query,filters,revision,retry]);
 useEffect(()=>{if(!loading&&paging.current&&result.pagination.page===page){paging.current=false;heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});}},[loading,result.pagination.page,page]);
 const changeFilters=(next:Partial<typeof filters>)=>{setPage(1);setFilters(current=>({...current,...next}));};
 const filtered=!!(query||filters.status||filters.from||filters.to);
 return <Page title="Payments" eyebrow="Your account"><div className="payment-history">
  <div className="payment-history-tools"><label className="payment-history-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search payments" placeholder="Search payment or receipt" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();setPage(1);setQuery(search.trim());}}}/></label>
   <details className="payment-history-filters"><summary><SlidersHorizontal size={16} aria-hidden="true"/>Filters{filters.status||filters.from||filters.to?' · Active':''}</summary><div className="payment-history-filter-fields">
    <label>Status<Select aria-label="Filter payment status" value={filters.status} onChange={event=>changeFilters({status:event.target.value})}><option value="">All statuses</option>{['paid','pending','refunded','failed'].map(state=><option key={state} value={state}>{stateLabel(state)}</option>)}</Select></label>
    <label>From date<input aria-label="From date" type="date" value={filters.from} onChange={event=>changeFilters({from:event.target.value})}/></label>
    <label>To date<input aria-label="To date" type="date" value={filters.to} onChange={event=>changeFilters({to:event.target.value})}/></label>
   </div>{filtered&&<Button variant="ghost" onClick={()=>{setSearch('');setQuery('');setPage(1);setFilters({status:'',from:'',to:''});}}>Clear filters</Button>}</details>
  </div>
  {error&&<div role="alert" className="payment-history-error"><p>{error}</p><Button variant="secondary" onClick={()=>setRetry(value=>value+1)}>Retry</Button></div>}
  <h2 className="sr-only" ref={heading} tabIndex={-1}>Payment records</h2>
  {loading?<div role="status" className="payment-history-loading"><span className="sr-only">Loading payments…</span>{[0,1,2].map(item=><div key={item} aria-hidden="true"/>)}</div>:<><div className="payment-history-list">{result.data.map(row=><PaymentCard row={row} key={row.id}/>)}</div>{!result.data.length&&!error&&<Empty title="No payment history found" body={filtered?'Try another date or clear a filter.':'Your payment records will appear here.'}/>}<HistoryPagination page={result.pagination.page} totalPages={result.pagination.totalPages} total={result.pagination.total} pageSize={PAGE_SIZE} noun={result.pagination.total===1?'payment':'payments'} label="Payment history pagination" disabled={loading} onPage={next=>{paging.current=true;setPage(next);}}/></>}
  <p className="payment-history-timezone">Times shown in Yangon.</p>
 </div></Page>;
}
