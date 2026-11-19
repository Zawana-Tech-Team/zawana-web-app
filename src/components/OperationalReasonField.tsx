import { operationalReasons, operationalReasonLabel } from '../../backend/src/domain/rescheduleReasons';
import { Select } from './Select';
export function OperationalReasonField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block text-sm">Reason<Select aria-label="Reason" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    <option value="">Choose a reason</option>
    {operationalReasons.map(reason => <option key={reason} value={reason}>{operationalReasonLabel(reason)}</option>)}
  </Select></label>;
}
