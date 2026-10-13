import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { UserRole } from '../types';
import { LocalizedTree } from '../context/LanguageContext';
import OptimizedImage from './OptimizedImage';

const covers: Record<
  UserRole,
  {
    root: string;
    label: string;
    title: string;
    body: string;
    image: string;
    to: string;
    action: string;
  }
> = {
  member: {
    root: '/member',
    label: 'YOUR ZAWANA',
    title: 'Make room for your next level.',
    body: 'Your court time, training, and community. All in one place.',
    image: 'court',
    to: '/book/court',
    action: 'Book a court'
  },
  admin: {
    root: '/admin',
    label: 'CENTRAL MANAGEMENT',
    title: 'Every detail. One arena.',
    body: 'A clear view of people, programs, and daily operations.',
    image: 'court',
    to: '/admin/users',
    action: 'Manage your team'
  },
  owner: {
    root: '/owner',
    label: 'BUSINESS OVERVIEW',
    title: 'One vision. Every business.',
    body: 'Connect the arena, its people, and the decisions that move it forward.',
    image: 'court',
    to: '/owner/finance',
    action: 'View finance'
  },
  badminton_fo: {
    root: '/badminton-fo',
    label: 'BADMINTON OPERATIONS',
    title: 'Keep the game moving.',
    body: 'Court bookings, check-ins, and sessions. Ready for your next player.',
    image: 'court',
    to: '/badminton-fo/bookings',
    action: 'View bookings'
  },
  gym_fo: {
    root: '/gym-fo',
    label: 'HIGH PERFORMANCE GYM',
    title: 'Performance starts here.',
    body: 'Memberships, coaching, and the everyday details behind better training.',
    image: 'gym',
    to: '/gym-fo/check-in',
    action: 'Open check-in'
  },
  clinic_fo: {
    root: '/clinic-fo',
    label: 'REVIVE CLINIC',
    title: 'Care, with intention.',
    body: 'A considered workspace for appointments, practitioners, and patient care.',
    image: 'revive',
    to: '/clinic-fo/appointments',
    action: 'View appointments'
  },
  store_fo: {
    root: '/store-fo',
    label: 'RETAIL OPERATIONS',
    title: 'Equip the next level.',
    body: 'Products, stock, and sales. The essentials behind every customer experience.',
    image: 'court',
    to: '/store-fo/products',
    action: 'View products'
  },
  cafe_fo: {
    root: '/cafe',
    label: 'ZAWANA CAFE',
    title: 'Good service. Every session.',
    body: 'Keep orders flowing and give the arena a place to recharge.',
    image: 'cafe',
    to: '/cafe/orders',
    action: 'View orders'
  },
  coach: {
    root: '/coach',
    label: 'COACHING WORKSPACE',
    title: 'Build what comes next.',
    body: 'Your calendar, your athletes, and your training sessions.',
    image: 'gym',
    to: '/coach/schedule',
    action: 'View your calendar'
  },
  doctor: {
    root: '/doctor',
    label: 'CLINICAL WORKSPACE',
    title: 'Move care forward.',
    body: 'Your appointments, schedule, and patient records, connected.',
    image: 'revive',
    to: '/doctor/appointments',
    action: 'View appointments'
  }
};

export default function WorkspaceCover({ role }: { role: UserRole }) {
  const { pathname } = useLocation();
  const cover = covers[role];
  if (pathname !== cover.root && !(role === 'member' && pathname === '/dashboard')) return null;
  return (
    <LocalizedTree>
      <div className="workspace-cover-wrap">
        <section className="workspace-cover" aria-label={cover.label}>
          <OptimizedImage
            src={`/facilities/responsive/${cover.image}-1280.webp`}
            sizes="(min-width: 1024px) 50vw, 100vw"
            alt=""
            width={1280}
            height={960}
            className="workspace-cover__image"
          />
          <div className="workspace-cover__shade" />
          <div className="workspace-cover__copy">
            <p>{cover.label}</p>
            <h2>{cover.title}</h2>
            <span>{cover.body}</span>
            <Link to={cover.to}>
              {cover.action}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <span className="workspace-cover__signature" aria-hidden="true">
            THE ART OF PERFORMANCE
          </span>
        </section>
      </div>
    </LocalizedTree>
  );
}
