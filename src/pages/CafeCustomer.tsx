import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Badge, Button, Card, Page } from '../components/UI';
import { useOperations } from '../context/OperationsContext';

const menu = [
  { id: 'coffee', name: 'Iced Americano', price: 5000, category: 'Coffee' },
  { id: 'wrap', name: 'Chicken Wrap', price: 9000, category: 'Food' },
  { id: 'bowl', name: 'Protein Bowl', price: 12000, category: 'Healthy' },
];

export function CafeCustomer() {
  const [floor, setFloor] = useState('Ground Floor');
  const [cart, setCart] = useState<{id:string;name:string;price:number;qty:number}[]>([]);
  const { addTransaction } = useOperations();
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  return <Page title="Zawana Cafe" eyebrow="Order from the arena">
    <div className="mb-6 flex flex-wrap gap-3">
      <Badge good>Cash or KPay</Badge><Badge>Floor delivery / collection</Badge>
    </div>
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {menu.map(item => <Card key={item.id} className="p-5"><p className="text-xs font-black uppercase tracking-widest text-zawana-gold">{item.category}</p><h2 className="mt-2 text-xl font-black">{item.name}</h2><p className="mt-2 font-bold">{item.price.toLocaleString()} MMK</p><Button className="mt-5 w-full" onClick={() => { const found=cart.find(x=>x.id===item.id); setCart(found?cart.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x):[...cart,{id:item.id,name:item.name,price:item.price,qty:1}]); }}>Add to order</Button></Card>)}
      </div>
      <Card className="h-fit p-6"><div className="flex items-center gap-2"><ShoppingBag size={18}/><h2 className="text-xl font-black">Your order</h2></div><label className="mt-5 block text-xs font-black uppercase tracking-widest text-zawana-500">Floor</label><select value={floor} onChange={e=>setFloor(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option>Ground Floor</option><option>First Floor</option><option>Outdoor</option></select><div className="my-5 space-y-3">{cart.map(item=><div key={item.id} className="flex justify-between text-sm"><span>{item.name} × {item.qty}</span><b>{(item.price*item.qty).toLocaleString()} MMK</b></div>)}</div><div className="border-t pt-4 flex justify-between text-xl font-black"><span>Total</span><span>{total.toLocaleString()} MMK</span></div><div className="mt-5 grid grid-cols-2 gap-2"><Button disabled={!cart.length} onClick={()=>{addTransaction({date:'2026-09-29',customer:'Sai Zay',business:'Cafe',item:cart.map(x=>x.name).join(', '),amount:total,discount:0,tax:0,finalAmount:total,paymentMethod:'Cash',staff:'Customer App',status:'paid'});setCart([]);}}>Cash</Button><Button variant="secondary" disabled={!cart.length} onClick={()=>{addTransaction({date:'2026-09-29',customer:'Sai Zay',business:'Cafe',item:cart.map(x=>x.name).join(', '),amount:total,discount:0,tax:0,finalAmount:total,paymentMethod:'KPay',staff:'Customer App',status:'paid'});setCart([]);}}>KPay</Button></div><Link to="/bookings" className="mt-4 flex items-center justify-center gap-1 text-xs font-bold text-zawana-500">View activity <ArrowRight size={13}/></Link></Card>
    </div>
  </Page>;
}
