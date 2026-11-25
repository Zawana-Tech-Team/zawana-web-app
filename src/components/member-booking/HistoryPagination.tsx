import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../UI';
import './history-pagination.css';

/** A visible pager even for one page, with the server's filtered record count. */
export function HistoryPagination({page,totalPages,total,pageSize,noun,label,disabled=false,onPage}:{
 page:number;totalPages:number;total:number;pageSize:number;noun:string;label:string;disabled?:boolean;onPage:(page:number)=>void;
}){
 const {locale}=useLanguage();
 const pages=Math.max(1,totalPages),current=Math.max(1,Math.min(page,pages));
 const first=total?(current-1)*pageSize+1:0,last=Math.min(current*pageSize,total);
 return <nav className="history-pagination" aria-label={label}>
  <p>{total?`${first.toLocaleString(locale)}–${last.toLocaleString(locale)} of ${total.toLocaleString(locale)} ${noun}`:`0 ${noun}`}</p>
  <div>
   <Button variant="secondary" disabled={disabled||current<=1} onClick={()=>onPage(current-1)}><ChevronLeft size={16} aria-hidden="true"/><span>Previous</span></Button>
   <span role="status">Page <strong>{current.toLocaleString(locale)}</strong> of {pages.toLocaleString(locale)}</span>
   <Button variant="secondary" disabled={disabled||current>=pages} onClick={()=>onPage(current+1)}><span>Next</span><ChevronRight size={16} aria-hidden="true"/></Button>
  </div>
 </nav>;
}
