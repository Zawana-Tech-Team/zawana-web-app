export type UserRole =
  | 'member'
  | 'coach'
  | 'admin'
  | 'gym_fo'
  | 'clinic_fo'
  | 'badminton_fo'
  | 'store_fo'
  | 'cafe_fo'
  | 'doctor'
  | 'owner';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
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
  kind: 'court' | 'class' | 'pt' | 'recovery' | 'private_course';
  title: string;
  date: string;
  time: string;
  location: string;
  status: 'pending'
    | 'confirmed'
    | 'completed'
    | 'cancelled'
    | 'PENDING_COACH_CONFIRMATION'
    | 'AWAITING_PAYMENT'
    | 'CONFIRMED'
    | 'COACH_DECLINED'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'EXPIRED';
  paymentStatus?: 'pending' | 'paid' | 'refunded';
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
  | 'member' | 'coach' | 'admin' | 'gym_fo' | 'clinic_fo' | 'all';

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
  entityType?: string | null;
  entityId?: string | null;
  actionLabel?: string | null;
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
  | 'pending' | 'confirmed' | 'rejected' | 'checked_in' | 'completed' | 'cancelled';

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

export type Status = 'active'
  | 'inactive'
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'overdue'
  | 'paid'
  | 'partially_paid';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PENDING_COACH_CONFIRMATION'
  | 'AWAITING_PAYMENT'
  | 'COACH_DECLINED'
  | 'EXPIRED';

export type Transaction = {
  id: string;
  date: string;
  customer: string;
  business: 'Gym' | 'Badminton' | 'Clinic' | 'Store' | 'Cafe' | 'Academy';
  item: string;
  amount: number;
  discount: number;
  tax: number;
  finalAmount: number;
  paymentMethod: 'Cash' | 'KPay' | 'Pay Later' | 'Other';
  staff: string;
  status: 'paid' | 'pending' | 'refunded';
};
export type CafeCashTransactionInput = {
  date: string;
  customer: string;
  business: 'Cafe';
  items: { id: string; quantity: number }[];
  paymentMethod: 'Cash';
};

export type BadmintonPackage = {
  id: string;
  title: string;
  price: number;
  sessions: number;
  validity: number;
  description: string;
  status: 'active' | 'inactive' | 'coming_soon';
  categoryId?: string | null;
  imageUrl?: string | null;
  availableDays?: string[] | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  scheduleNotes?: string | null;
  courtRules?: string | null;
  category?: { id: string; name: string } | null;
};

export type GymPackage = {
  id: string;
  title: string;
  price: number;
  duration: number;
  sessions: number;
  description: string;
  benefits: string[];
  status: 'active' | 'inactive';
};

export type MembershipRecord = {
  accessMode?: string;
  enrollmentId?: string | null;
  id: string;
  customerId: string;
  customer: string;
  phone: string;
  packageId: string;
  package: string;
  startDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'pending';
  lastCheckIn?: string;
  sessionsTotal: number;
  sessionsRemaining: number;
  checkIns?: {
    id: string;
    date: string;
    time: string;
    sessionsUsed: number;
    note?: string | null
  }[];
};

export type CourtBooking = {
  id: string;
  customer: string;
  court: string;
  date: string;
  time: string;
  session: number;
  price: number;
  paymentStatus: 'paid' | 'pending' | 'refunded';
  status: BookingStatus;
  coachAcceptedAt?: string | null;
  paymentExpiresAt?: string | null;
  reservationExpiresAt?: string | null;
};

export type Appointment = {
  id: string;
  patient: string;
  doctor: string;
  date: string;
  time: string;
  type: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
  notes?: string;
  paymentStatus: 'paid' | 'pending';
};

export type ManagedCourt = {
  id: string;
  name: string;
  type: 'Premium' | 'Standard';
  surface: string;
  price: number;
  status: 'available' | 'maintenance' | 'inactive';
  features: string[];
};

export type CoachProfile = {
  id: string;
  name: string;
  specialty: string;
  department?: 'Badminton' | 'Gym';
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  color: string;
  imageUrl?: string | null;
};

export type Schedule = {
  id: string;
  person: string;
  role: 'doctor';
  day: string;
  start: string;
  end: string;
  service?: string;
  active: boolean;
};

export type InventoryTransaction = {
  id: string;
  productId: string;
  type: 'add' | 'remove' | 'adjust';
  quantity: number;
  note: string;
  date: string;
};

export type ProductCategory = { id: string; name: string; active: boolean };
export type CafeMenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  available: boolean;
  imageUrl?: string | null
};

export type StoreProduct = Product & {
  sku: string;
  barcode: string;
  stock: number;
  cost: number;
  tax: number;
  status: 'active' | 'inactive';
  imageUrl?: string | null;
};

export type StoreOrder = {
  id: string;
  customer: string;
  total: number;
  discount?: number;
  tax?: number;
  paid: number;
  dueDate?: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue';
  items: { productId: string; quantity: number; name?: string; price?: number }[];
  paymentMethod?: 'Cash' | 'KPay' | 'Pay Later' | 'Pay Online';
  itemSummary?: string;
};

export type CafeOrder = {
  id: string;
  orderNumber?: string | null;
  customerId?: string | null;
  customer: string;
  items: { id?: string; name: string; quantity: number; price: number; notes?: string | null }[];
  location?: string;
  floor: string;
  court?: { id: string; name: string } | null;
  courtId?: string | null;
  orderTime: string;
  paymentMethod: 'CASH' | 'ONLINE' | 'PAY_LATER' | 'Cash' | 'KPay' | 'Pay Later';
  paymentStatus?: 'pending' | 'paid';
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  status: 'NEW'
    | 'PREPARING'
    | 'READY'
    | 'DELIVERING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'ready'
    | 'completed'
    | 'cancelled';
};

export type ContentItem = {
  id: string;
  kind: 'community' | 'achievement';
  category: 'Milestones' | 'Tournaments' | 'Academy' | 'Community';
  body: string;
  title: string;
  image: string;
  description: string;
  googleFormLink: string;
  status: 'draft' | 'published';
  publishDate: string;
};

export type AchievementSummary = Pick<ContentItem, 'id' | 'title' | 'kind' | 'category' | 'description' | 'image' | 'publishDate'>;

export type PublicCoach = {
  id: string;
  name: string;
  specialty: string;
  department: 'Badminton';
  imageUrl: string | null;
};

export type Student = {
  id: string;
  name: string;
  phone: string;
  className: string;
  coach: string;
  package: string;
  paymentStatus: 'paid' | 'pending';
  attendance: number;
  expiryDate: string;
  status: 'active' | 'inactive';
};

export type PatientRecord = {
  id: string;
  patient: string;
  injury: string;
  bodyPart: string;
  description: string;
  treatment: string;
  doctor: string;
  date: string;
  status: 'active' | 'resolved';
};

export type PerformanceRecord = {
  id: string;
  customer: string;
  metric: string;
  value: string;
  date: string;
  coach: string;
};
