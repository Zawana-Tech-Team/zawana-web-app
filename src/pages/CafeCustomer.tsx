import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Minus, Plus, ShoppingBag } from 'lucide-react';
import { Badge, Button, Card, Empty, Page } from '../components/UI';
import ServiceIntro from '../components/ServiceIntro';
import { useOperations } from '../context/OperationsContext';
import { post } from '../api';
import { CAFE_LOCATIONS } from '../constants/cafe';
import { mediaImageSrc } from '../components/ImageUpload';

export function CafeCustomer() {
  const [location, setLocation] = useState<(typeof CAFE_LOCATIONS)[number]>('Cafe');
  const [courtId, setCourtId] = useState('');
  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState('');
  const { menu, managedCourts } = useOperations();
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const useCourt = location.includes('Badminton Court');
  const change = (id: string, delta: number) =>
    setCart(items =>
      items.flatMap(item =>
        item.id !== id ? [item] : item.qty + delta < 1 ? [] : [{ ...item, qty: item.qty + delta }]
      )
    );
  const checkout = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await post<any>('/cafe/orders', {
        location,
        ...(useCourt && courtId ? { courtId } : {}),
        items: cart.map(item => ({ id: item.id, quantity: item.qty })),
        paymentMethod: 'ONLINE'
      });
      setSuccess(
        `${result.order?.orderNumber || 'Order'} received. Payment is pending; no online charge has been collected.`
      );
      setCart([])
    } catch (e: any) {
      setError(e.message || 'Could not place your order.')
    } finally {
      setBusy(false)
    }
  };
  return <Page title="Zawana Cafe" eyebrow="Order from the arena">
    <ServiceIntro image="cafe" label="REFUEL / RECONNECT" title="A moment between the moments." body="Coffee, good company, and a place to recharge between sessions." />
    <div className="mb-6 flex flex-wrap gap-3">
      <Badge good>Fresh menu</Badge>
      <Badge>Payment status shown clearly</Badge>
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!menu.some(item => item.available) && <div className="sm:col-span-2 xl:col-span-3"><Empty title="No menu items available" body="Please check back or speak with the cafe team." /></div>}
        {menu
          .filter(item => item.available)
          .map(item =>
            <button
              key={item.id}
              onClick={() => {
                const found = cart.find(x => x.id === item.id);
                setCart(
                  found
                    ? cart.map(x =>x.id === item.id ? { ...x, qty: x.qty + 1 } : x)
                    : [...cart, { id: item.id, name: item.name, price: item.price, qty: 1 }]
                );
              }}
              className="overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:border-zawana-gold hover:shadow-lg"
            >
              <div className="h-40 bg-zawana-50">
                {item.imageUrl ?
                  <img
                    src={mediaImageSrc(item.imageUrl)}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  /> :
                  <div className="grid h-full place-items-center text-sm text-zawana-400">Zawana Cafe</div>}
              </div>
              <div className="p-4">
                <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">
                  {item.category}
                </p>
                <h2 className="mt-2 text-xl font-black">{item.name}</h2>
                <p className="mt-2 font-bold">{item.price.toLocaleString()} MMK</p>
              </div>
            </button>)}
      </div>
      <Card className="h-fit p-6 lg:sticky lg:top-5">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} />
          <h2 className="text-xl font-black">Your order</h2>
        </div>
        <label className="mt-5 block text-xs font-black uppercase tracking-widest text-zawana-500">Order location<select
            value={location}
            onChange={e => {
              setLocation(e.target.value as (typeof CAFE_LOCATIONS)[number]);
              setCourtId('')
            }}
            className="mt-2 w-full"
          >
            {CAFE_LOCATIONS.map(value =>
              <option key={value}>{value}</option>
            )}
          </select>
        </label>
        {useCourt &&
          <label className="mt-3 block text-xs font-black uppercase tracking-widest text-zawana-500">Court (optional)<select
              value={courtId}
              onChange={e => setCourtId(e.target.value)}
              className="mt-2 w-full"
            >
              <option value="">Choose court</option>
              {managedCourts.map(court =>
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              )}
            </select>
          </label>}
        <div className="my-5 space-y-3">
          {cart.map(item =>
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <b>{item.name}</b>
                <p className="text-xs text-zawana-500">{item.price.toLocaleString()} MMK each</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label={`Remove one ${item.name}`}
                  className="rounded-lg border p-2"
                  onClick={() => change(item.id, -1)}
                >
                  <Minus size={13} />
                </button>
                <b>{item.qty}</b>
                <button
                  aria-label={`Add one ${item.name}`}
                  className="rounded-lg border p-2"
                  onClick={() => change(item.id, 1)}
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}
          {!cart.length &&
            <p className="py-4 text-center text-sm text-zawana-400">Add an item to start an order.</p>}
        </div>
        <div className="border-t pt-4 flex justify-between text-xl font-black">
          <span>Total</span>
          <span>{total.toLocaleString()} MMK</span>
        </div>
        {error &&
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>}
        {success &&
          <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {success}
          </p>}
        <Button
          className="mt-5 w-full"
          disabled={!cart.length || busy}
          onClick={() => void checkout()}
        >
          {busy ? 'Submitting order…' : 'Submit online order'}
        </Button>
        <p className="mt-2 text-center text-[11px] text-zawana-500">Online checkout is not configured. The order will remain unpaid until staff records payment.</p>
        <Link
          to="/bookings"
          className="mt-4 flex items-center justify-center gap-1 text-xs font-bold text-zawana-500"
        >View activity <ArrowRight size={13} />
        </Link>
      </Card>
    </div>
  </Page>;
}
