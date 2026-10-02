import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Badge, Button, Card, Page } from '../components/UI';
import { useOperations } from '../context/OperationsContext';
import { post } from '../api';


export function CafeCustomer() {
  const [floor, setFloor] = useState('Ground Floor');
  const [cart, setCart] = useState<{id:string;name:string;price:number;qty:number}[]>([]);
  const { menu } = useOperations();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const checkout=async()=>{setBusy(true);setError('');try{const result=await post<any>('/cafe/orders',{floor,items:cart.map(item=>({id:item.id,quantity:item.qty}))});if(result.payment?.checkoutUrl)window.location.assign(result.payment.checkoutUrl);else if(result.payment?.qrCode)window.location.assign(`/payment/${result.payment.id}`);else throw new Error('KPay did not return a checkout link.')}catch(e:any){setError(e.message||'Could not start KPay checkout.')}finally{setBusy(false)}};
  return <Page title="Zawana Cafe" eyebrow="Order from the arena">
    <div className="mb-6 flex flex-wrap gap-3">
      <Badge good>KPay secure checkout</Badge><Badge>Floor delivery / collection</Badge>
    </div>
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-4 sm:grid-cols-2">
        {menu.filter(item => item.available).map(item => <Card key={item.id} className="p-5"><p className="text-xs font-black uppercase tracking-widest text-zawana-gold">{item.category}</p><h2 className="mt-2 text-xl font-black">{item.name}</h2><p className="mt-2 font-bold">{item.price.toLocaleString()} MMK</p><Button className="mt-5 w-full" onClick={() => { const found=cart.find(x=>x.id===item.id); setCart(found?cart.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x):[...cart,{id:item.id,name:item.name,price:item.price,qty:1}]); }}>Add to order</Button></Card>)}
      </div>
      <Card className="h-fit p-6"><div className="flex items-center gap-2"><ShoppingBag size={18}/><h2 className="text-xl font-black">Your order</h2></div><label className="mt-5 block text-xs font-black uppercase tracking-widest text-zawana-500">Floor</label><select value={floor} onChange={e=>setFloor(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option>Ground Floor</option><option>First Floor</option><option>Outdoor</option></select><div className="my-5 space-y-3">{cart.map(item=><div key={item.id} className="flex justify-between text-sm"><span>{item.name} × {item.qty}</span><b>{(item.price*item.qty).toLocaleString()} MMK</b></div>)}</div><div className="border-t pt-4 flex justify-between text-xl font-black"><span>Total</span><span>{total.toLocaleString()} MMK</span></div>{error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button className="mt-5 w-full" disabled={!cart.length||busy} onClick={()=>void checkout()}>{busy?'Opening KPay…':'Pay with KPay'}</Button><Link to="/bookings" className="mt-4 flex items-center justify-center gap-1 text-xs font-bold text-zawana-500">View activity <ArrowRight size={13}/></Link></Card>
    </div>
  </Page>;
}
