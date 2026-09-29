import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  bookings as seedBookings,
  notifications as seedNotifications,
} from '../data';

import type {
  Booking,
  CartItem,
  Notification,
  ReviveBooking,
  ReviveBookingStatus,
} from '../types';

type NewReviveBooking = Omit<
  ReviveBooking,
  'id' | 'createdAt' | 'status'
> & {
  status?: ReviveBookingStatus;
};

type Ctx = {
  // Existing app data
  bookings: Booking[];
  notifications: Notification[];
  cart: CartItem[];

  // Revive Clinic
  reviveBookings: ReviveBooking[];

  // Existing actions
  addBooking: (booking: Booking) => void;
  cancelBooking: (id: string) => void;
  addNotification: (notification: Notification) => void;
  addToCart: (productId: string) => void;

  // Revive actions
  addReviveBooking: (booking: NewReviveBooking) => void;
  updateReviveBookingStatus: (
    id: string,
    status: ReviveBookingStatus
  ) => void;
};

const C = createContext<Ctx | null>(null);

const load = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(
      localStorage.getItem(key) || 'null'
    ) ?? fallback;
  } catch {
    return fallback;
  }
};

const reviveSeed: ReviveBooking[] = [
  {
    id: 'RV-001',
    memberId: 'u1',
    memberName: 'Sai Zay',
    memberPhone: '09 765 432 100',
    service: 'Sports Massage',
    practitioner: 'May Thu',
    practitionerRole: 'Sports Therapist',
    date: '2026-09-30',
    time: '4:30 PM',
    status: 'confirmed',
    source: 'online',
    notes: 'Lower-body recovery after high-volume training.',
    createdAt: '2026-09-28T10:00:00',
  },

  {
    id: 'RV-002',
    memberId: 'u2',
    memberName: 'Htet Aung',
    memberPhone: '09 432 118 210',
    service: 'Physio Assessment',
    practitioner: 'Dr. Lin',
    practitionerRole: 'Physiotherapist',
    date: '2026-09-29',
    time: '6:00 PM',
    status: 'pending',
    source: 'online',
    notes: 'Movement screen and follow-up.',
    createdAt: '2026-09-29T08:30:00',
  },
];

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  // -------------------------------------------------------
  // EXISTING APP STATE
  // -------------------------------------------------------

  const [bookings, setBookings] = useState<Booking[]>(
    () => load('zw-bookings', seedBookings)
  );

  const [notifications, setNotifications] =
    useState<Notification[]>(
      () => load('zw-notifications', seedNotifications)
    );

  const [cart, setCart] = useState<CartItem[]>(
    () => load('zw-cart', [])
  );

  // -------------------------------------------------------
  // REVIVE CLINIC STATE
  // -------------------------------------------------------

  const [reviveBookings, setReviveBookings] =
    useState<ReviveBooking[]>(
      () => load('zw-revive-bookings', reviveSeed)
    );

  // -------------------------------------------------------
  // PERSIST TO LOCAL STORAGE
  // -------------------------------------------------------

  useEffect(() => {
    localStorage.setItem(
      'zw-bookings',
      JSON.stringify(bookings)
    );
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem(
      'zw-notifications',
      JSON.stringify(notifications)
    );
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(
      'zw-cart',
      JSON.stringify(cart)
    );
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(
      'zw-revive-bookings',
      JSON.stringify(reviveBookings)
    );
  }, [reviveBookings]);

  // -------------------------------------------------------
  // EXISTING BOOKING ACTIONS
  // -------------------------------------------------------

  const addBooking = (booking: Booking) => {
    setBookings((current) => [
      booking,
      ...current,
    ]);
  };

  const cancelBooking = (id: string) => {
    setBookings((current) =>
      current.map((booking) =>
        booking.id === id
          ? {
              ...booking,
              status: 'cancelled',
            }
          : booking
      )
    );
  };

  // -------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------

  const addNotification = (
    notification: Notification
  ) => {
    setNotifications((current) => [
      notification,
      ...current,
    ]);
  };

  // -------------------------------------------------------
  // CART
  // -------------------------------------------------------

  const addToCart = (productId: string) => {
    setCart((current) => {
      const existing = current.find(
        (item) => item.productId === productId
      );

      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId,
          quantity: 1,
        },
      ];
    });
  };

  // -------------------------------------------------------
  // ADD REVIVE BOOKING
  // -------------------------------------------------------

  const addReviveBooking = (
    booking: NewReviveBooking
  ) => {
    const id = `RV-${String(
      reviveBookings.length + 1
    ).padStart(3, '0')}`;

    /*
     * Online/member booking:
     *   pending
     *
     * Front-office booking:
     *   confirmed
     *
     * The caller can explicitly provide the status.
     */

    const newBooking: ReviveBooking = {
      ...booking,
      id,
      status: booking.status ?? 'pending',
      createdAt: new Date().toISOString(),
    };

    setReviveBookings((current) => [
      newBooking,
      ...current,
    ]);

    // ---------------------------------------------------
    // ONLINE BOOKING NOTIFICATION
    // ---------------------------------------------------

    if (newBooking.status === 'pending') {
      addNotification({
        id: `revive-request-${id}`,
        title: 'Revive booking requested',
        body: `${newBooking.service} on ${newBooking.date} at ${newBooking.time} is waiting for clinic confirmation.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }

    // ---------------------------------------------------
    // FRONT DESK CONFIRMED NOTIFICATION
    // ---------------------------------------------------

    if (
      newBooking.status === 'confirmed' &&
      newBooking.source === 'front_desk'
    ) {
      addNotification({
        id: `revive-confirmed-${id}`,
        title: 'Revive appointment scheduled',
        body: `${newBooking.service} with ${newBooking.practitioner} is scheduled for ${newBooking.date} at ${newBooking.time}.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }
  };

  // -------------------------------------------------------
  // UPDATE REVIVE BOOKING STATUS
  // -------------------------------------------------------

  const updateReviveBookingStatus = (
    id: string,
    status: ReviveBookingStatus
  ) => {
    const booking = reviveBookings.find(
      (item) => item.id === id
    );

    if (!booking) return;

    setReviveBookings((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
            }
          : item
      )
    );

    // ---------------------------------------------------
    // CONFIRMED
    // ---------------------------------------------------

    if (status === 'confirmed') {
      addNotification({
        id: `revive-confirm-${id}-${Date.now()}`,
        title: 'Revive appointment confirmed',
        body: `${booking.service} with ${booking.practitioner} is confirmed for ${booking.date} at ${booking.time}.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }

    // ---------------------------------------------------
    // REJECTED
    // ---------------------------------------------------

    if (status === 'rejected') {
      addNotification({
        id: `revive-reject-${id}-${Date.now()}`,
        title: 'Revive appointment declined',
        body: `Your ${booking.service} request for ${booking.date} at ${booking.time} was not confirmed by Revive Clinic.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }

    // ---------------------------------------------------
    // CHECKED IN
    // ---------------------------------------------------

    if (status === 'checked_in') {
      addNotification({
        id: `revive-checkin-${id}-${Date.now()}`,
        title: 'Revive check-in complete',
        body: `${booking.memberName} has been checked in for ${booking.service}.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }

    // ---------------------------------------------------
    // COMPLETED
    // ---------------------------------------------------

    if (status === 'completed') {
      addNotification({
        id: `revive-complete-${id}-${Date.now()}`,
        title: 'Revive appointment completed',
        body: `Your ${booking.service} appointment has been marked as completed.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }

    // ---------------------------------------------------
    // CANCELLED
    // ---------------------------------------------------

    if (status === 'cancelled') {
      addNotification({
        id: `revive-cancel-${id}-${Date.now()}`,
        title: 'Revive appointment cancelled',
        body: `Your ${booking.service} appointment on ${booking.date} at ${booking.time} has been cancelled.`,
        time: 'Just now',
        read: false,
        link: '/recovery',
      });
    }
  };

  // -------------------------------------------------------
  // PROVIDER
  // -------------------------------------------------------

  return (
    <C.Provider
      value={{
        bookings,
        notifications,
        cart,

        reviveBookings,

        addBooking,
        cancelBooking,
        addNotification,
        addToCart,

        addReviveBooking,
        updateReviveBookingStatus,
      }}
    >
      {children}
    </C.Provider>
  );
}

export const useApp = () => {
  const context = useContext(C);

  if (!context) {
    throw new Error(
      'useApp must be used inside AppProvider'
    );
  }

  return context;
};