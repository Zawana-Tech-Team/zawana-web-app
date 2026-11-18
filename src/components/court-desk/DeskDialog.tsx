import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { DialogSurface } from '../Interactions';
import { Button } from '../UI';
import './court-desk.css';

/** Shared Court Desk chrome; each workflow owns its validation and submission state. */
export function DeskDialog({ title, heading=title, eyebrow, description, onClose, busy=false,
  closeLabel='Close dialog', cancelLabel='Cancel', actions, summary, children,
  size='standard', className='', bodyClassName='', steps,
}: {
  title:string; heading?:ReactNode; eyebrow?:ReactNode; description?:ReactNode;
  onClose:()=>void; busy?:boolean; closeLabel?:string; cancelLabel?:string;
  actions?:ReactNode; summary?:ReactNode; children:ReactNode;
  size?:'compact'|'standard'|'wide'; className?:string; bodyClassName?:string; steps?:ReactNode;
}) {
  return <DialogSurface title={title} onClose={()=>{if(!busy)onClose();}}
    className={`desk-reservation-dialog desk-dialog desk-dialog--${size} ${className}`}>
    <header className="desk-reservation-dialog__header">
      <div className="min-w-0">{eyebrow&&<p className="desk-dialog__eyebrow">{eyebrow}</p>}
        <h2 className="desk-dialog__title">{heading}</h2>{description&&<p className="desk-dialog__description">{description}</p>}
      </div>
      <Button type="button" variant="ghost" disabled={busy} className="desk-dialog__close" aria-label={closeLabel} onClick={onClose}><X size={18} aria-hidden="true"/></Button>
    </header>
    {steps}
    <div className={`desk-reservation-dialog__body ${bodyClassName}`}>{children}</div>
    <footer className="desk-reservation-dialog__footer">
      {summary&&<div className="desk-dialog__footer-summary">{summary}</div>}
      <div className="desk-dialog__actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{cancelLabel}</Button>{actions}</div>
    </footer>
  </DialogSurface>;
}

export function DeskSteps({labels,current}:{labels:string[];current:number}){
  return <ol aria-label="Workflow progress" className="desk-steps">{labels.map((label,index)=><li key={label} aria-current={current===index?'step':undefined} data-complete={index<current||undefined}><span aria-hidden="true">{index+1}</span>{label}</li>)}</ol>;
}

export function DeskSchedule({label,court,date,time,children}:{label:string;court?:string;date:string;time:string;children?:ReactNode}){
  return <section className="desk-schedule" aria-label={label}><span className="desk-schedule__label">{label}</span>{court&&<strong>{court}</strong>}<p>{date} <span aria-hidden="true">·</span> {time}</p>{children}</section>;
}
