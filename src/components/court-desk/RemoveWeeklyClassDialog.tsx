import { useRef, useState } from 'react';
import { post } from '../../api';
import { DeskDialog } from './DeskDialog';
import { Button } from '../UI';

type Source = { id: string; title: string; date: string; time: string };
export function RemoveWeeklyClassDialog({sources,onClose,onRemoved,occurrenceOnly = false}: {
  occurrenceOnly?: boolean; sources: Source[]; onClose: () => void; onRemoved: () => Promise<void>;
}) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const lock = useRef(false), requestKey = useRef(crypto.randomUUID());
  const blockIds = [...new Set(sources.map(source => source.id))];
  const remove = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await post(occurrenceOnly ? '/rescheduling/weekly/remove-occurrences' : '/rescheduling/weekly/remove', occurrenceOnly ? { occurrences: sources.map(source => ({ id: source.id, date: source.date })), requestKey: requestKey.current } : {blockIds,requestKey:requestKey.current});
      await onRemoved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove weekly classes.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <DeskDialog title="Remove weekly class" heading={occurrenceOnly ? "Remove today’s class only?" : "Remove this weekly class?"} size="compact" onClose={onClose} busy={busy} closeLabel="Close weekly removal"
    actions={<Button variant="danger" disabled={busy} loading={busy} onClick={()=>void remove()}>{occurrenceOnly ? "Remove Today" : "Remove Weekly"}</Button>} bodyClassName="space-y-4">
      <p className="text-sm">{occurrenceOnly ? "This removes only the selected occurrences without changing future weekly classes." : <>Remove {blockIds.length === 1 ? 'this class' : 'these classes'} from the recurring weekly schedule? Today’s active occurrence and all future occurrences, including rescheduled sessions, will be removed.</>}</p>
      <ul className="space-y-2 text-sm" aria-label="Weekly classes to remove">{sources.filter((s,i)=>sources.findIndex(other=>other.id===s.id)===i).map(source=><li key={source.id}><strong>{source.title}</strong><p className="text-xs text-zawana-500">Selected: {source.date} · {source.time}</p></li>)}</ul>
      <p className="text-xs text-zawana-500">Stored class records, historical attendance, student enrollments and transaction records will be kept. The selected reservation will stop blocking the court; attendance and financial records stay unchanged. Other court rentals and private courses are unaffected.</p>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </DeskDialog>;
}
