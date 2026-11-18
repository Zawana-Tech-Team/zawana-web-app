import type { ManagedCourt } from '../../types';

/** Keep the application's existing floor convention; do not infer floors for other court names. */
export function courtFloor(court: Pick<ManagedCourt, 'name'> & { floor?: string | null }) {
  if (court.floor === '2nd Floor' || court.floor === '6th Floor') return court.floor.toLowerCase();
  const number = Number(court.name.match(/(\d+)\D*$/)?.[1]);
  return number >= 1 && number <= 4 ? '2nd floor' : number >= 5 && number <= 8 ? '6th floor' : 'Other courts';
}

export type TimetableInterval = { id: string; start: number; end: number };

/** Clip visual blocks to the visible day and keep simultaneous reservations individually accessible. */
export function timetablePositions(events: TimetableInterval[], start: number, end: number) {
  const visible = events.filter(event => event.end > start && event.start < end)
    .map(event => ({ ...event, start: Math.max(start, event.start), end: Math.min(end, event.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: { id: string; top: number; height: number; lane: number; lanes: number }[] = [];
  let group: typeof visible = [], groupEnd = -Infinity;
  const flush = () => {
    const lanes: number[] = [];
    const positions = group.map(event => {
      let lane = lanes.findIndex(until => until <= event.start);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = event.end;
      return { id: event.id, top: (event.start - start) / (end - start) * 100, height: (event.end - event.start) / (end - start) * 100, lane };
    });
    result.push(...positions.map(position => ({ ...position, lanes: lanes.length })));
  };
  for (const event of visible) {
    if (event.start >= groupEnd) { flush(); group = []; }
    group.push(event); groupEnd = Math.max(groupEnd, event.end);
  }
  flush();
  return result;
}
