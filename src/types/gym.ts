export type GymKind = 'MEMBERSHIP' | 'PT' | 'COUPLE_PT' | 'GROUP_PT' | 'WALK_IN';
export const gymKindLabels: Record<GymKind, string> = {
  MEMBERSHIP: 'Gym membership', PT: 'Personal training', COUPLE_PT: 'Couple PT', GROUP_PT: 'Group PT', WALK_IN: 'Walk-in',
};
export type GymCatalogPackage = {
  id: string; title: string; kind: GymKind; description: string; benefits: string[];
  price: number; rate: number; months: number; sessions: number; duration: number;
  validityDays: number; sessionMinutes: number; minMembers: number; maxMembers: number;
  coachRequired: boolean; version: number; status: string;
};
export type GymPerson = { id: string; name: string; email: string; phone?: string | null };
export type GymCoach = { id: string; name: string; specialty?: string; userId?: string | null };
export type GymReceiptRecord = { id: string; date: string; finalAmount: number; paymentMethod: string; staff: string; status: string };
export type GymEnrollment = {
  id: string; code: string; packageId: string; packageVersion: number; snapshot: GymCatalogPackage;
  kind: GymKind; totalPrice: number; sessionsTotal: number; sessionsRemaining: number;
  status: string; effectiveStatus?: string; startDate: string; expiryDate: string;
  coachId?: string | null; coach?: GymCoach | null; paidAt?: string | null;
  members: { userId: string; user: GymPerson }[]; transaction?: GymReceiptRecord | null;
  renewalOfId?: string | null;
};
export type GymSession = {
  id: string; member: GymPerson; coach: GymCoach; enrollmentId?: string | null;
  date: string; startTime: string; endTime: string; durationMinutes: number; status: string; notes?: string | null;
  attendance: { userId: string; user: GymPerson; status: string }[];
  enrollment?: { id: string; code: string; snapshot: GymCatalogPackage; sessionsRemaining: number; sessionsTotal: number; expiryDate: string } | null;
  debit?: { sessionId: string } | null;
};
export type GymPage<T> = { data: T[]; pagination: { page: number; total: number; totalPages: number } };
export const gymMoney = (amount: number) => `${amount.toLocaleString()} MMK`;
export const gymToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
