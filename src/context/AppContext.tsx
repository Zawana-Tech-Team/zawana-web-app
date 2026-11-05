import { INBOX_CHANGED, INBOX_REFRESH } from '../services/notificationInbox';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Booking, CartItem, Notification, ReviveBooking, ReviveBookingStatus } from "../types";
import { get, patch } from "../api";
import { useAuth } from "./AuthContext";

type NewReviveBooking = Omit<ReviveBooking, "id" | "createdAt" | "status"> & {
  status?: ReviveBookingStatus
};
type Ctx = {
  bookings: Booking[];
  notifications: Notification[];
  cart: CartItem[];
  reviveBookings: ReviveBooking[];
  loading: boolean;
  addBooking: (booking: Booking) => void;
  cancelBooking: (id: string) => Promise<void>;
  addNotification: (n: Notification) => void;
  addToCart: (productId: string) => void;
  addReviveBooking: (booking: NewReviveBooking) => void;
  updateReviveBookingStatus: (id: string, status: ReviveBookingStatus) => void;
};

const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id, userRole = user?.role;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [reviveBookings, setReviveBookings] = useState<ReviveBooking[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const b = await get<any[]>("/bookings");
      setBookings(
        b.map(x => ({
          id: x.code || x.id,
          kind: x.kind,
          title: x.title,
          date: x.date,
          time: x.time,
          location: x.location,
          status: x.status,
          price: x.price,
          meta: x.meta
        }))
      );

    } finally {
      setLoading(false)
    }
  }, [userId]);
  useEffect(() => {
    refresh().catch(console.error)
  }, [refresh]);

  useEffect(() => {
    setNotifications([]);
    if (!userId) return;
    let alive = true, revision = 0;
    const cleared = new Set<string>();
    const refreshInbox = async () => {
      const requestId = ++revision;
      try {
        const rows = await get<any[]>('/notifications');
        if (alive && revision === requestId) setNotifications(rows.filter(row => !cleared.has(row.id)).map(row => ({ ...row, time: row.createdAt })));
      } catch { /* Preserve the current inbox on a transient request failure. */ }
    };
    const changed = (event: Event) => {
      const ids = (event as CustomEvent<{ ids: string[] }>).detail.ids;
      ++revision; ids.forEach(id => cleared.add(id));
      setNotifications(rows => rows.filter(row => !ids.includes(row.id)));
    };
    const refreshEvent = () => { void refreshInbox(); };
    window.addEventListener(INBOX_CHANGED, changed); window.addEventListener(INBOX_REFRESH, refreshEvent); window.addEventListener('focus', refreshEvent);
    void refreshInbox();
    const timer = setInterval(() => { if (!document.hidden) void refreshInbox(); }, 10000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(INBOX_CHANGED, changed); window.removeEventListener(INBOX_REFRESH, refreshEvent); window.removeEventListener('focus', refreshEvent); };
  }, [userId, userRole]);

  const addBooking = (booking: Booking) => setBookings(v => [booking, ...v]);
  const cancelBooking = async (id: string) => {
    const found = bookings.find(b => b.id === id);
    if (found)
      await patch(`/bookings/${id.startsWith("ZW-") ? id : found.id}/status`, {
        status: "cancelled"
      }).catch(async () => {
        // code-based ids are supported below by fallback refresh
        const rows = await get<any[]>("/bookings");
        const row = rows.find(x => x.code === id);
        if (row) await patch(`/bookings/${row.id}/status`, { status: "cancelled" });
      });
    await refresh();
  };
  const addNotification = (n: Notification) => setNotifications(v => [n, ...v]);
  const addToCart = (productId: string) =>
    setCart(v => {
      const e = v.find(x => x.productId === productId);
      return e
        ? v.map(x =>x.productId === productId ? { ...x, quantity: x.quantity + 1 } : x)
        : [...v, { productId, quantity: 1 }];
    });
  const addReviveBooking = (b: NewReviveBooking) =>
    setReviveBookings(v => [
      {
        ...b,
        id: `RV-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: b.status || "pending"
      },
      ...v
    ]);
  const updateReviveBookingStatus = (id: string, status: ReviveBookingStatus) =>
    setReviveBookings(v => v.map(x =>x.id === id ? { ...x, status } : x));

  return <C.Provider
    value={{
      bookings,
      notifications,
      cart,
      reviveBookings,
      loading,
      addBooking,
      cancelBooking,
      addNotification,
      addToCart,
      addReviveBooking,
      updateReviveBookingStatus
    }}
  >
    {children}
  </C.Provider>
}

export const useApp = () => {
  const c = useContext(C);
  if (!c) throw Error("useApp must be used inside AppProvider");
  return c
};
