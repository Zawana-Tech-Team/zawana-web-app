
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Booking, CartItem, Notification, ReviveBooking, ReviveBookingStatus } from "../types";
import { api, get, post, patch } from "../api";
import { useAuth } from "./AuthContext";

type NewReviveBooking=Omit<ReviveBooking,"id"|"createdAt"|"status">&{status?:ReviveBookingStatus};
type Ctx={
  bookings:Booking[];
  notifications:Notification[];
  cart:CartItem[];
  reviveBookings:ReviveBooking[];
  loading:boolean;
  addBooking:(booking:Booking)=>void;
  cancelBooking:(id:string)=>Promise<void>;
  addNotification:(n:Notification)=>void;
  addToCart:(productId:string)=>void;
  addReviveBooking:(booking:NewReviveBooking)=>void;
  updateReviveBookingStatus:(id:string,status:ReviveBookingStatus)=>void;
};

const C=createContext<Ctx|null>(null);

export function AppProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [notifications,setNotifications]=useState<Notification[]>([]);
  const [cart,setCart]=useState<CartItem[]>([]);
  const [reviveBookings,setReviveBookings]=useState<ReviveBooking[]>([]);
  const [loading,setLoading]=useState(false);

  const refresh=async()=>{
    if(!user)return;
    setLoading(true);
    try {
      const [b,n]=await Promise.all([get<any[]>("/bookings"),get<any[]>("/notifications")]);
      setBookings(b.map(x=>({id:x.code||x.id,kind:x.kind,title:x.title,date:x.date,time:x.time,location:x.location,status:x.status,price:x.price,meta:x.meta})));
      setNotifications(n.map(x=>({id:x.id,title:x.title,body:x.body,time:new Date(x.createdAt).toLocaleString(),read:x.read,link:x.link,audience:x.audience,type:x.type,entityType:x.entityType,entityId:x.entityId,actionLabel:x.actionLabel})));
    } finally {setLoading(false)}
  };
  useEffect(()=>{refresh().catch(console.error)},[user?.id]);

  const addBooking=(booking:Booking)=>setBookings(v=>[booking,...v]);
  const cancelBooking=async(id:string)=>{
    const found=bookings.find(b=>b.id===id);
    if(found) await patch(`/bookings/${id.startsWith("ZW-")?id:found.id}/status`,{status:"cancelled"}).catch(async()=>{
      // code-based ids are supported below by fallback refresh
      const rows=await get<any[]>("/bookings"); const row=rows.find(x=>x.code===id);
      if(row) await patch(`/bookings/${row.id}/status`,{status:"cancelled"});
    });
    await refresh();
  };
  const addNotification=(n:Notification)=>setNotifications(v=>[n,...v]);
  const addToCart=(productId:string)=>setCart(v=>{
    const e=v.find(x=>x.productId===productId);
    return e?v.map(x=>x.productId===productId?{...x,quantity:x.quantity+1}:x):[...v,{productId,quantity:1}];
  });
  const addReviveBooking=(b:NewReviveBooking)=>setReviveBookings(v=>[{...b,id:`RV-${Date.now()}`,createdAt:new Date().toISOString(),status:b.status||"pending"},...v]);
  const updateReviveBookingStatus=(id:string,status:ReviveBookingStatus)=>setReviveBookings(v=>v.map(x=>x.id===id?{...x,status}:x));

  return <C.Provider value={{bookings,notifications,cart,reviveBookings,loading,addBooking,cancelBooking,addNotification,addToCart,addReviveBooking,updateReviveBookingStatus}}>{children}</C.Provider>
}
export const useApp=()=>{const c=useContext(C);if(!c)throw Error("useApp must be used inside AppProvider");return c};
