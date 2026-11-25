import { useId, useRef } from 'react';
import { PackagePlus } from 'lucide-react';
import { DeskDialog } from './court-desk/DeskDialog';
import { Button } from './UI';
import { BadmintonCategoryField } from './BadmintonCategoryField';
import { BadmintonAvailableDays } from './BadmintonAvailableDays';
import { ImageUpload } from './ImageUpload';
import './badminton-package-management.css';

export type PackageFormValue={title:string;categoryId:string;price:string|number;sessions:string|number;validity:string|number;description:string;availableDays:string[];imageUrl?:string|null;status?:string;availableFrom?:string;availableUntil?:string;scheduleNotes?:string;courtRules?:string};
export function BadmintonPackageDialog({value,onChange,editing=false,busy,uploadBusy,onUploadBusy,onClose,onSave,error,legacyReview=false,onLegacyReview}:{
 value:PackageFormValue;onChange:(changes:Partial<PackageFormValue>)=>void;editing?:boolean;busy:boolean;uploadBusy:boolean;onUploadBusy:(busy:boolean)=>void;onClose:()=>void;onSave:()=>Promise<void>;error:string;legacyReview?:boolean;onLegacyReview?:(value:boolean)=>void;
}){
 const id=useId(),blocked=busy||uploadBusy;
 const lock=useRef(false);
 const valid=!!value.title.trim()&&!!value.categoryId&&Number(value.price)>0&&[value.sessions,value.validity].every(number=>Number.isInteger(Number(number))&&Number(number)>0);
 const submit=async()=>{if(lock.current||blocked||!valid)return;lock.current=true;try{await onSave();}finally{lock.current=false;}};
 return <DeskDialog title={editing?'Edit badminton package':'Create badminton package'} heading={<span className="package-form-title"><PackagePlus size={22} aria-hidden="true"/>{editing?'Edit package':'New package'}</span>} onClose={onClose} busy={blocked} className="badminton-package-dialog" actions={<Button type="submit" form={id} loading={busy} disabled={blocked||!valid}>{editing?'Save changes':'Create package'}</Button>}>
  <form id={id} onSubmit={event=>{event.preventDefault();void submit();}} className="badminton-package-form"><fieldset disabled={blocked}>
   <div className="package-form-grid"><label>Package title<input required maxLength={120} autoComplete="off" value={value.title||''} onChange={event=>onChange({title:event.target.value})}/></label><BadmintonCategoryField value={value.categoryId} onChange={categoryId=>onChange({categoryId})}/></div>
   <div className="package-form-price"><label>Price <span>MMK</span><input required type="number" min={1} value={value.price??''} onChange={event=>onChange({price:event.target.value})}/></label></div>
   <div className="package-form-grid"><label>Sessions<input required type="number" min={1} step={1} value={value.sessions??''} onChange={event=>onChange({sessions:event.target.value})}/></label><label>Validity days<input aria-label="Validity days" required type="number" min={1} step={1} value={value.validity??''} onChange={event=>onChange({validity:event.target.value})}/></label></div>
   <BadmintonAvailableDays value={value.availableDays} onChange={availableDays=>onChange({availableDays})} disabled={blocked}/>
   {editing&&<label>Status<select value={value.status||'active'} onChange={event=>onChange({status:event.target.value})}><option value="active">Active</option><option value="coming_soon">Coming soon</option><option value="inactive">Inactive</option></select></label>}
   <details open className="package-form-optional"><summary>Description &amp; image <span>Optional</span></summary><div><label>Description<textarea maxLength={2000} rows={3} value={value.description||''} onChange={event=>onChange({description:event.target.value})}/></label><ImageUpload label="Package image" value={value.imageUrl} onChange={imageUrl=>onChange({imageUrl})} onBusyChange={onUploadBusy}/></div></details>
   {!editing&&<details className="package-form-optional"><summary>Schedule &amp; court rules <span>Optional</span></summary><div><div className="package-form-grid"><label>Available from<input type="time" value={value.availableFrom||''} onChange={event=>onChange({availableFrom:event.target.value})}/></label><label>Available until<input type="time" value={value.availableUntil||''} onChange={event=>onChange({availableUntil:event.target.value})}/></label></div><label>Schedule notes<input maxLength={2000} value={value.scheduleNotes||''} onChange={event=>onChange({scheduleNotes:event.target.value})}/></label><label>Court rules<input maxLength={2000} value={value.courtRules||''} onChange={event=>onChange({courtRules:event.target.value})}/></label></div></details>}
   {editing&&onLegacyReview&&<details className="package-form-optional"><summary>Legacy category review</summary><label className="package-form-review"><input type="checkbox" checked={legacyReview} onChange={event=>onLegacyReview(event.target.checked)}/><span>I reviewed this package’s legacy records. Apply this category to its unclassified enrollments and matching attendance history. Existing classified categories and session balances stay unchanged.</span></label></details>}
  </fieldset></form>{error&&<p role="alert" className="package-management-error">{error}</p>}
 </DeskDialog>;
}
