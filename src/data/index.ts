import type {
  ClassItem,
  Court,
  Membership,
  Notification,
  Product,
  User,
  Booking,
  MetricPoint
} from '../types';
export const users: User[] = [
  { id: 'u1', name: 'Sai Zay', email: 'member@zawana.test', role: 'member', membership: 'Athlete' },
  { id: 'u2', name: 'Coach Sai', email: 'coach@zawana.test', role: 'coach' },
  { id: 'u3', name: 'Zawana Admin', email: 'admin@zawana.test', role: 'admin' },
  { id: 'u4', name: 'Gym FO', email: 'gymfo@zawana.test', role: 'gym_fo' },
  { id: 'u5', name: 'Revive FO', email: 'clinicfo@zawana.test', role: 'clinic_fo' },
  { id: 'u6', name: 'Badminton FO', email: 'badminton@zawana.test', role: 'badminton_fo' },
  { id: 'u7', name: 'Lining Store', email: 'store@zawana.test', role: 'store_fo' },
  { id: 'u8', name: 'Zawana Cafe', email: 'cafe@zawana.test', role: 'cafe_fo' },
  { id: 'u9', name: 'Dr. Lin', email: 'doctor@zawana.test', role: 'doctor' },
];
export const courts: Court[] = Array.from({ length: 6 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Court ${String(i + 1).padStart(2, '0')}`,
  type: [1, 2, 5, 6].includes(i + 1) ? 'Premium' : 'Standard',
  price: [1, 2, 5, 6].includes(i + 1) ? 18000 : 15000,
  status: i === 1 ? 'maintenance' : 'available',
  features: ['Indoor', 'LED lighting', i === 0 ? 'Tournament flooring' : 'Premium flooring']
}));
export const classes: ClassItem[] = [
  {
    id: 'cl1',
    title: 'Strength & Conditioning',
    coach: 'Coach Sai',
    time: '6:00 PM',
    duration: 60,
    capacity: 15,
    booked: 12,
    level: 'Intermediate',
    location: 'Performance Lab',
    price: 20000
  },
  {
    id: 'cl2',
    title: 'HIIT',
    coach: 'Coach Aung',
    time: '7:00 PM',
    duration: 45,
    capacity: 20,
    booked: 10,
    level: 'All levels',
    location: 'Training Studio',
    price: 15000
  },
  {
    id: 'cl3',
    title: 'Badminton Group Training',
    coach: 'Coach Min',
    time: '5:00 PM',
    duration: 60,
    capacity: 12,
    booked: 8,
    level: 'Beginner',
    location: 'Court 04',
    price: 18000
  }
];
export const memberships: Membership[] = [
  {
    id: 'open',
    name: 'Open Gym',
    price: 100000,
    period: 'month',
    features: ['Unlimited gym access', 'Locker access', 'Basic assessment']
  },
  {
    id: 'athlete',
    name: 'Athlete',
    price: 250000,
    period: 'month',
    features: ['Gym access', 'Performance testing', 'Training program', 'Coach consultation']
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 350000,
    period: 'month',
    features: ['Everything in Athlete', 'PT sessions', 'Recovery access', 'Priority booking']
  }
];
export const bookings: Booking[] = [
  {
    id: 'ZW-20260928-001',
    kind: 'court',
    title: 'Court 03',
    date: '28 Sep 2026',
    time: '6:30 PM — 7:30 PM',
    location: 'Indoor Court',
    status: 'confirmed',
    price: 15000
  }
];
export const notifications: Notification[] = [
  {
    id: 'n1',
    title: 'Booking confirmed',
    body: 'Your badminton court booking for 6:00 PM has been confirmed.',
    time: '10 min ago',
    read: false,
    audience: 'member',
    type: 'booking',
    link: '/bookings',
  },

  {
    id: 'n2',
    title: 'Client assessment due',
    body: 'Htet Aung has an assessment scheduled for today.',
    time: '25 min ago',
    read: false,
    audience: 'coach',
    type: 'assessment',
    link: '/coach/assessments',
  },

  {
    id: 'n3',
    title: 'New member registration',
    body: 'A new member registration requires front-office verification.',
    time: '32 min ago',
    read: false,
    audience: 'admin',
    type: 'member',
    link: '/admin/members',
  },

  {
    id: 'n4',
    title: 'Member checked in',
    body: 'Sai Zay has checked into the High Performance Gym.',
    time: '8 min ago',
    read: false,
    audience: 'gym_fo',
    type: 'checkin',
    link: '/front-office/gym',
  },

  {
    id: 'n5',
    title: 'New clinic booking request',
    body: 'Htet Aung requested Physiotherapy at 4:30 PM with Dr. Lin.',
    time: '5 min ago',
    read: false,
    audience: 'clinic_fo',
    type: 'clinic',
    link: '/front-office/revive-clinic',
  },

  {
    id: 'n6',
    title: 'Appointment confirmed',
    body: 'The appointment for Su Myat Thiri has been confirmed.',
    time: '1 hr ago',
    read: true,
    audience: 'clinic_fo',
    type: 'success',
    link: '/front-office/revive-clinic',
  },

  {
    id: 'n7',
    title: 'System maintenance',
    body: 'Zawana booking services will receive scheduled maintenance tonight.',
    time: '2 hrs ago',
    read: true,
    audience: 'all',
    type: 'system',
  },
];
export const products: Product[] = [
  {
    id: 'p1',
    name: 'Zawana Training Tee',
    price: 45000,
    category: 'Apparel',
    description: 'Technical training tee with a clean ZAWANA mark.'
  },
  {
    id: 'p2',
    name: 'Performance Shorts',
    price: 55000,
    category: 'Apparel',
    description: 'Lightweight shorts built for court movement.'
  },
  {
    id: 'p3',
    name: 'Zawana Rash Guard',
    price: 65000,
    category: 'Performance',
    description: 'Compression fit for training sessions.'
  },
  {
    id: 'p4',
    name: 'Arena Gym Bag',
    price: 85000,
    category: 'Accessories',
    description: 'Structured daily training bag.'
  },
  {
    id: 'p5',
    name: 'Steel Water Bottle',
    price: 30000,
    category: 'Accessories',
    description: 'Insulated 750ml bottle.'
  },
  {
    id: 'p6',
    name: 'Training Bands',
    price: 25000,
    category: 'Training',
    description: 'Three resistance levels for mobility and warm-ups.'
  }
];
export const revenue: MetricPoint[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep'
].map((name, i) => ({ name, value: [32, 35, 37, 40, 42, 45, 43, 47, 48.5][i] }));
export const performance: MetricPoint[] = [
  { name: 'Jan', value: 100 },
  { name: 'Mar', value: 110 },
  { name: 'Jun', value: 120 },
  { name: 'Sep', value: 125 }
];
