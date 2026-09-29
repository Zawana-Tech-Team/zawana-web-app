export type UserRole =
  | 'member'
  | 'coach'
  | 'admin'
  | 'gym_fo'
  | 'clinic_fo';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  membership?: string;
  avatar?: string;
};

export type Court = {
  id: string;
  name: string;
  type: 'Premium' | 'Standard';
  price: number;
  status: 'available' | 'maintenance';
  features: string[];
};

export type Booking = {
  id: string;
  kind: 'court' | 'class' | 'pt' | 'recovery';
  title: string;
  date: string;
  time: string;
  location: string;
  status: 'confirmed' | 'completed' | 'cancelled';
  price: number;
  meta?: string;
};

export type ClassItem = {
  id: string;
  title: string;
  coach: string;
  time: string;
  duration: number;
  capacity: number;
  booked: number;
  level: string;
  location: string;
  price: number;
};

export type Membership = {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
};

export type NotificationAudience =
  | 'member'
  | 'coach'
  | 'admin'
  | 'gym_fo'
  | 'clinic_fo'
  | 'all';

export type NotificationType =
  | 'booking'
  | 'checkin'
  | 'clinic'
  | 'assessment'
  | 'member'
  | 'payment'
  | 'membership'
  | 'alert'
  | 'success'
  | 'system';

export type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  link?: string;
  audience?: NotificationAudience;
  type?: NotificationType;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
};

export type CartItem = {
  productId: string;
  quantity: number;
};

export type MetricPoint = {
  name: string;
  value: number;
  value2?: number;
};

export type ReviveBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'checked_in'
  | 'completed'
  | 'cancelled';

export type ReviveBooking = {
  id: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  service: string;
  practitioner: string;
  practitionerRole: string;
  date: string;
  time: string;
  status: ReviveBookingStatus;
  source: 'online' | 'front_desk';
  notes?: string;
  createdAt: string;
};