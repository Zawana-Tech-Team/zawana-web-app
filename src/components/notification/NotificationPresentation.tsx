import { Bell, CalendarDays, CircleAlert, CreditCard, Package, ScanLine } from 'lucide-react';
import './staff-notifications.css';

export type InboxNotice = { id: string; title: string; body: string; createdAt: string; type?: string; entityType?: string; read: boolean; link?: string; actionLabel?: string; imageUrl?: string; activeInInbox?: boolean; expiresAt?: string };
export function notificationCategory(notice: { type?: string; entityType?: string }) {
  const type = notice.type?.toLowerCase() || '';
  return ['booking', 'reschedule', 'appointment'].includes(type) ? 'Bookings'
    : ['payment', 'transaction', 'refund'].includes(type) ? 'Payments'
    : ['package', 'membership'].includes(type) ? 'Packages'
    : ['attendance', 'check-in'].includes(type) ? 'Attendance' : 'Updates';
}
export function NotificationGraphic({ notice }: { notice: { type?: string; entityType?: string; imageUrl?: string } }) {
  const category = notificationCategory(notice);
  const Icon = ['warning', 'alert', 'security'].includes(notice.type || '') ? CircleAlert : category === 'Bookings' ? CalendarDays : category === 'Payments' ? CreditCard : category === 'Packages' ? Package : category === 'Attendance' ? ScanLine : Bell;
  return <span className="staff-notification-icon" data-kind={category} aria-hidden="true">{notice.imageUrl ? <img src={notice.imageUrl} alt=""/> : <Icon size={18} strokeWidth={1.6}/>}</span>;
}
export function notificationTimestamp(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(locale, { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
