export const badmintonWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function badmintonDaysLabel(days?: string[] | null) {
  const selected = badmintonWeekdays.filter(day => days?.includes(day));
  return selected.length ? selected.join(', ') : 'No day restrictions set';
}

export function BadmintonAvailableDays({ value, onChange, disabled = false }: {
  value?: string[] | null;
  onChange: (days: string[]) => void;
  disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <legend className="text-xs font-bold text-zawana-500">Available days</legend>
    <div className="flex flex-wrap gap-2">
      {badmintonWeekdays.map(day => <label key={day} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${value?.includes(day) ? 'border-zawana-gold bg-zawana-gold/10' : 'border-zawana-border'}`}>
        <input type="checkbox" checked={value?.includes(day) ?? false} onChange={event => {
          const selected = new Set(value || []);
          if (event.target.checked) selected.add(day);
          else selected.delete(day);
          onChange(badmintonWeekdays.filter(candidate => selected.has(candidate)));
        }} />
        {day}
      </label>)}
    </div>
    <p className="text-xs text-zawana-500">Leave all days unchecked to keep the schedule unrestricted.</p>
  </fieldset>;
}
