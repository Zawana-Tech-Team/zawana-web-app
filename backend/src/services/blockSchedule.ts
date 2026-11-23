import { addDateKeyDays } from '../utils/dateKeys.js';
export type BlockOverride = { type: string; weeklyOnly?: boolean; holidayActive?: boolean; suspendedBlockIds?: unknown; categoryCodes?: unknown };
export type ScheduledBlock = { id?: string; type?: string; categoryCode?: string | null; date: string; dayOfWeek: number | null; active?: boolean | number; effectiveFrom?: string | null; effectiveUntil?: string | null; excludedDates?: unknown };
export function blockExcludedDates(block: ScheduledBlock): string[] {
  let value = block.excludedDates;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = []; } }
  return Array.isArray(value) ? value.filter((d): d is string => typeof d === 'string') : [];
}
export function blockOccurs(block: ScheduledBlock, date: string, override: boolean | BlockOverride | null = false) {
  if (block.active === false || block.active === 0 || (block.effectiveFrom && date < block.effectiveFrom) || (block.effectiveUntil && date > block.effectiveUntil) || blockExcludedDates(block).includes(date)) return false;
  const bypassRecurring = override === true || (!!override && typeof override === 'object' && override.type === 'open' && !override.weeklyOnly);
  if (override && typeof override === 'object' && override.weeklyOnly && block.type === 'class' && ((override.holidayActive && (!Array.isArray(override.categoryCodes) || override.categoryCodes.includes(block.categoryCode))) || (Array.isArray(override.suspendedBlockIds) && override.suspendedBlockIds.includes(block.id)))) return false;
  return block.date === date || (!bypassRecurring && block.dayOfWeek != null && new Date(`${date}T12:00:00Z`).getUTCDay() === block.dayOfWeek);
}
export function blocksShareDate(a: ScheduledBlock, b: ScheduledBlock, from: string, overrides: ReadonlyMap<string, BlockOverride> = new Map()) {
  if (a.date) return a.date >= from && blockOccurs(a, a.date, overrides.get(a.date)) && blockOccurs(b, a.date, overrides.get(a.date));
  if (b.date) return b.date >= from && blockOccurs(a, b.date, overrides.get(b.date)) && blockOccurs(b, b.date, overrides.get(b.date));
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  let date = [from, a.effectiveFrom || from, b.effectiveFrom || from].sort().at(-1)!;
  const until = [a.effectiveUntil, b.effectiveUntil].filter((x): x is string => !!x).sort()[0];
  for (let i = 0; i < (blockExcludedDates(a).length + blockExcludedDates(b).length + overrides.size + 2) * 7; i++, date = addDateKeyDays(date, 1)) {
    if (until && date > until) return false;
    if (blockOccurs(a, date, overrides.get(date)) && blockOccurs(b, date, overrides.get(date))) return true;
  }
  return false;
}
