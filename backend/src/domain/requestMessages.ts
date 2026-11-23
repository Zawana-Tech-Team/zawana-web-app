/** Central English catalogue; callers can add locale catalogues without changing workflows. */
const en = {
  EVENT: 'Dear Customer,\n\nWe sincerely apologize for the inconvenience. Due to an upcoming event at The Zawana, we kindly request an adjustment to your scheduled court booking.\n\nPlease review the proposed changes and select your preferred option.\n\nThank you for your understanding and cooperation.\n\nThe Zawana Team',
  MAINTENANCE: 'Dear Customer,\n\nWe sincerely apologize for the inconvenience. Due to necessary maintenance at The Zawana, we kindly request an adjustment to your scheduled court booking to ensure a safe and comfortable experience.\n\nPlease review the proposed changes and select your preferred option.\n\nThank you for your patience and understanding.\n\nThe Zawana Team',
};
export function requestMessage(reason: string, locale: 'en' = 'en') {
  const catalog = { en }[locale];
  return reason === 'EVENT' || reason === 'MAINTENANCE' ? catalog[reason] : reason;
}
export function requestScheduleMessage(schedule: { court?: string | null; date?: string; time?: string }, label = 'Original Booking') {
  const values = [schedule.court, schedule.date, schedule.time].filter(Boolean);
  return values.length ? `${label}: ${values.join(', ')}` : '';
}

/** Affected-booking notices are acknowledgements, not replacement proposals. */
export function affectedBookingMessage(reason: string) {
  const cause = reason === 'EVENT' ? 'a scheduled event' : reason === 'MAINTENANCE' ? 'scheduled maintenance' : 'an operational change';
  return `Dear Valued Customer,\n\nWe sincerely apologize for the inconvenience. Due to ${cause} at The Zawana, your existing court reservation has been affected.\n\nPlease review your affected bookings below and choose how you would like us to proceed.\n\nThank you for your understanding and cooperation.\n\nThe Zawana Team`;
}
