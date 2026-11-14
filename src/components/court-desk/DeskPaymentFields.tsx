import { SegmentedControl } from '../Interactions';

export type DeskPaymentSelection = { method: 'CASH' | 'ONLINE' | ''; received: boolean; reference: string };
export const emptyDeskPayment = (): DeskPaymentSelection => ({ method: '', received: false, reference: '' });
export const deskPaymentReady = (payment: DeskPaymentSelection) => !!payment.method && payment.received && (payment.method !== 'ONLINE' || payment.reference.trim().length >= 3);

export function DeskPaymentFields({ value, onChange, disabled = false }: {
  value: DeskPaymentSelection; onChange: (value: DeskPaymentSelection) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="desk-payment-fields">
    <legend>Payment received</legend>
    <SegmentedControl label="Payment method" value={value.method} onChange={method => onChange({ method: method as 'CASH' | 'ONLINE', received: false, reference: '' })}
      options={[{ value: 'CASH', label: 'Cash' }, { value: 'ONLINE', label: 'Online payment' }]} />
    {value.method === 'ONLINE' && <label>Existing payment reference<input maxLength={200} value={value.reference} onChange={event => onChange({ ...value, reference: event.target.value, received: false })} placeholder="Transaction / receipt reference" />
      <small>Record a payment already received. No checkout is started.</small></label>}
    {!!value.method && <label className="desk-payment-confirm"><input type="checkbox" checked={value.received} onChange={event => onChange({ ...value, received: event.target.checked })} />
      <span>{value.method === 'CASH' ? 'I received the full amount in cash.' : 'I verified the existing online payment for the full amount.'}</span></label>}
  </fieldset>;
}
