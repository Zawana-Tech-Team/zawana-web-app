import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  Appointment, BadmintonPackage, CafeOrder, ContentItem, CourtBooking, GymPackage,
  InventoryTransaction, MembershipRecord, Schedule, StoreOrder, StoreProduct,
  Student, Transaction
} from '../types';

const seed = <T,>(key: string, value: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? value; } catch { return value; }
};

const today = '2026-09-29';

const initialBadmintonPackages: BadmintonPackage[] = [
  {id:'bp1',title:'Court 10 Sessions',price:150000,sessions:10,validity:60,description:'Ten standard court sessions.',status:'active'},
  {id:'bp2',title:'Premium 20 Sessions',price:320000,sessions:20,validity:90,description:'Premium court access for regular players.',status:'active'},
];
const initialGymPackages: GymPackage[] = [
  {id:'gp1',title:'Open Gym',price:100000,duration:30,description:'Unlimited gym access.',benefits:['Gym access','Locker'],status:'active'},
  {id:'gp2',title:'Athlete',price:250000,duration:30,description:'Performance membership.',benefits:['Gym','Testing','Coach consultation'],status:'active'},
  {id:'gp3',title:'Premium',price:350000,duration:30,description:'Full performance access.',benefits:['Everything in Athlete','PT','Recovery'],status:'active'},
];
const initialMemberships: MembershipRecord[] = [
  {id:'M-001',customerId:'u1',customer:'Sai Zay',phone:'09 765 432 100',packageId:'gp2',package:'Athlete',startDate:'2026-09-01',expiryDate:'2026-09-30',status:'active',lastCheckIn:'2026-09-28 18:10'},
  {id:'M-002',customerId:'u2',customer:'Htet Aung',phone:'09 432 118 210',packageId:'gp3',package:'Premium',startDate:'2026-09-10',expiryDate:'2026-10-10',status:'active',lastCheckIn:'2026-09-27 17:45'},
];
const initialCourtBookings: CourtBooking[] = [
  {id:'CB-001',customer:'Sai Zay',court:'Court 03',date:today,time:'6:30 PM',session:60,price:15000,paymentStatus:'paid',status:'pending'},
  {id:'CB-002',customer:'Htet Aung',court:'Court 01',date:today,time:'7:30 PM',session:60,price:18000,paymentStatus:'pending',status:'confirmed'},
];
const initialAppointments: Appointment[] = [
  {id:'AP-001',patient:'Htet Aung',doctor:'Dr. Lin',date:today,time:'6:00 PM',type:'Physio Assessment',status:'pending',paymentStatus:'pending',notes:'Movement screen and follow-up.'},
  {id:'AP-002',patient:'Su Myat Thiri',doctor:'Dr. Lin',date:'2026-09-30',time:'4:30 PM',type:'Physiotherapy',status:'confirmed',paymentStatus:'paid'},
];
const initialSchedules: Schedule[] = [
  {id:'SC-1',person:'Coach Sai',role:'coach',day:'Monday',start:'09:00',end:'13:00',service:'Strength & Conditioning',active:true},
  {id:'SC-2',person:'Coach Sai',role:'coach',day:'Thursday',start:'14:00',end:'18:00',service:'Personal Training',active:true},
  {id:'SC-3',person:'Dr. Lin',role:'doctor',day:'Tuesday',start:'10:00',end:'18:00',service:'Physiotherapy',active:true},
  {id:'SC-4',person:'Dr. Lin',role:'doctor',day:'Friday',start:'10:00',end:'18:00',service:'Physiotherapy',active:true},
];
const initialProducts: StoreProduct[] = [
  {id:'p1',name:'Zawana Training Tee',price:45000,category:'Apparel',description:'Technical training tee.',sku:'ZAW-TEE-01',barcode:'890000000001',stock:24,cost:25000,tax:0,status:'active'},
  {id:'p2',name:'Performance Shorts',price:55000,category:'Apparel',description:'Lightweight court shorts.',sku:'ZAW-SHT-01',barcode:'890000000002',stock:8,cost:30000,tax:0,status:'active'},
  {id:'p3',name:'Training Bands',price:25000,category:'Training',description:'Resistance band set.',sku:'ZAW-BND-01',barcode:'890000000003',stock:4,cost:12000,tax:0,status:'active'},
];
const initialCafeOrders: CafeOrder[] = [
  {id:'CA-001',customer:'Sai Zay',items:[{name:'Iced Americano',quantity:1,price:5000},{name:'Chicken Wrap',quantity:1,price:9000}],floor:'Ground Floor',orderTime:'11:40 AM',paymentMethod:'Cash',status:'pending'},
];
const initialTransactions: Transaction[] = [
  {id:'TX-001',date:today,customer:'Sai Zay',business:'Gym',item:'Athlete Membership',amount:250000,discount:0,tax:0,finalAmount:250000,paymentMethod:'KPay',staff:'Gym FO',status:'paid'},
  {id:'TX-002',date:today,customer:'Htet Aung',business:'Clinic',item:'Physio Assessment',amount:45000,discount:0,tax:0,finalAmount:45000,paymentMethod:'Cash',staff:'Clinic FO',status:'paid'},
  {id:'TX-003',date:today,customer:'Su Myat Thiri',business:'Cafe',item:'Cafe Order',amount:14000,discount:0,tax:0,finalAmount:14000,paymentMethod:'Cash',staff:'Cafe FO',status:'paid'},
];
const initialContent: ContentItem[] = [
  {id:'CT-001',title:'September Community Challenge',image:'/facilities/gym.webp',description:'Train together this September.',googleFormLink:'https://forms.google.com/',status:'published',publishDate:today},
];
const initialStudents: Student[] = [
  {id:'ST-001',name:'Aung Min',phone:'09 555 123 444',className:'Junior Academy',coach:'Coach Min',package:'10 Sessions',paymentStatus:'paid',attendance:92,expiryDate:'2026-10-15',status:'active'},
  {id:'ST-002',name:'May Thu',phone:'09 555 222 333',className:'Performance Academy',coach:'Coach Sai',package:'20 Sessions',paymentStatus:'pending',attendance:84,expiryDate:'2026-10-05',status:'active'},
];

type OperationsContextValue = {
  badmintonPackages: BadmintonPackage[]; gymPackages: GymPackage[]; memberships: MembershipRecord[];
  courtBookings: CourtBooking[]; appointments: Appointment[]; schedules: Schedule[];
  products: StoreProduct[]; inventory: InventoryTransaction[]; storeOrders: StoreOrder[];
  cafeOrders: CafeOrder[]; transactions: Transaction[]; content: ContentItem[]; students: Student[];
  addBadmintonPackage:(p:Omit<BadmintonPackage,'id'>)=>void;
  addGymPackage:(p:Omit<GymPackage,'id'>)=>void;
  addMembership:(m:Omit<MembershipRecord,'id'>)=>void;
  updateCourtBooking:(id:string,status:CourtBooking['status'])=>void;
  updateAppointment:(id:string,status:Appointment['status'])=>void;
  updateCafeOrder:(id:string,status:CafeOrder['status'])=>void;
  addTransaction:(t:Omit<Transaction,'id'>)=>void;
  addProduct:(p:Omit<StoreProduct,'id'>)=>void;
  adjustStock:(productId:string,quantity:number,note:string)=>void;
  addContent:(c:Omit<ContentItem,'id'>)=>void;
  publishContent:(id:string)=>void;
  addStudent:(s:Omit<Student,'id'>)=>void;
  addSchedule:(s:Omit<Schedule,'id'>)=>void;
  metrics:{todayRevenue:number;monthlyRevenue:number;pendingBookings:number;appointmentsToday:number;lowStock:number};
};

const C=createContext<OperationsContextValue|null>(null);
export function OperationsProvider({children}:{children:ReactNode}){
 const [badmintonPackages,setBadmintonPackages]=useState(()=>seed('zw-badminton-packages',initialBadmintonPackages));
 const [gymPackages,setGymPackages]=useState(()=>seed('zw-gym-packages',initialGymPackages));
 const [memberships,setMemberships]=useState(()=>seed('zw-memberships-records',initialMemberships));
 const [courtBookings,setCourtBookings]=useState(()=>seed('zw-court-bookings',initialCourtBookings));
 const [appointments,setAppointments]=useState(()=>seed('zw-appointments',initialAppointments));
 const [schedules,setSchedules]=useState(()=>seed('zw-schedules',initialSchedules));
 const [products,setProducts]=useState(()=>seed('zw-store-products',initialProducts));
 const [inventory,setInventory]=useState<InventoryTransaction[]>(()=>seed('zw-inventory',[]));
 const [storeOrders,setStoreOrders]=useState<StoreOrder[]>(()=>seed('zw-store-orders',[]));
 const [cafeOrders,setCafeOrders]=useState(()=>seed('zw-cafe-orders',initialCafeOrders));
 const [transactions,setTransactions]=useState(()=>seed('zw-transactions',initialTransactions));
 const [content,setContent]=useState(()=>seed('zw-content',initialContent));
 const [students,setStudents]=useState(()=>seed('zw-students',initialStudents));
 const persist=[['zw-badminton-packages',badmintonPackages],['zw-gym-packages',gymPackages],['zw-memberships-records',memberships],['zw-court-bookings',courtBookings],['zw-appointments',appointments],['zw-schedules',schedules],['zw-store-products',products],['zw-inventory',inventory],['zw-store-orders',storeOrders],['zw-cafe-orders',cafeOrders],['zw-transactions',transactions],['zw-content',content],['zw-students',students]] as const;
 useEffect(()=>{persist.forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)))},[badmintonPackages,gymPackages,memberships,courtBookings,appointments,schedules,products,inventory,storeOrders,cafeOrders,transactions,content,students]);
 const addBadmintonPackage=(p:Omit<BadmintonPackage,'id'>)=>setBadmintonPackages(x=>[{...p,id:`BP-${Date.now()}`},...x]);
 const addGymPackage=(p:Omit<GymPackage,'id'>)=>setGymPackages(x=>[{...p,id:`GP-${Date.now()}`},...x]);
 const addMembership=(m:Omit<MembershipRecord,'id'>)=>setMemberships(x=>[{...m,id:`M-${Date.now()}`},...x]);
 const updateCourtBooking=(id:string,status:CourtBooking['status'])=>setCourtBookings(x=>x.map(b=>b.id===id?{...b,status}:b));
 const updateAppointment=(id:string,status:Appointment['status'])=>setAppointments(x=>x.map(a=>a.id===id?{...a,status}:a));
 const updateCafeOrder=(id:string,status:CafeOrder['status'])=>setCafeOrders(x=>x.map(o=>o.id===id?{...o,status}:o));
 const addTransaction=(t:Omit<Transaction,'id'>)=>setTransactions(x=>[{...t,id:`TX-${Date.now()}`},...x]);
 const addProduct=(p:Omit<StoreProduct,'id'>)=>setProducts(x=>[{...p,id:`P-${Date.now()}`},...x]);
 const adjustStock=(productId:string,quantity:number,note:string)=>{
   setProducts(x=>x.map(p=>p.id===productId?{...p,stock:Math.max(0,p.stock+quantity)}:p));
   setInventory(x=>[{id:`INV-${Date.now()}`,productId,type:quantity>=0?'add':'remove',quantity:Math.abs(quantity),note,date:today},...x]);
 };
 const addContent=(c:Omit<ContentItem,'id'>)=>setContent(x=>[{...c,id:`CT-${Date.now()}`},...x]);
 const publishContent=(id:string)=>setContent(x=>x.map(c=>c.id===id?{...c,status:'published',publishDate:today}:c));
 const addStudent=(s:Omit<Student,'id'>)=>setStudents(x=>[{...s,id:`ST-${Date.now()}`},...x]);
 const addSchedule=(s:Omit<Schedule,'id'>)=>setSchedules(x=>[{...s,id:`SC-${Date.now()}`},...x]);
 const metrics=useMemo(()=>({todayRevenue:transactions.filter(t=>t.date===today&&t.status==='paid').reduce((a,t)=>a+t.finalAmount,0),monthlyRevenue:transactions.reduce((a,t)=>a+t.finalAmount,0),pendingBookings:courtBookings.filter(b=>b.status==='pending').length,appointmentsToday:appointments.filter(a=>a.date===today).length,lowStock:products.filter(p=>p.stock<=5&&p.status==='active').length}),[transactions,courtBookings,appointments,products]);
 return <C.Provider value={{badmintonPackages,gymPackages,memberships,courtBookings,appointments,schedules,products,inventory,storeOrders,cafeOrders,transactions,content,students,addBadmintonPackage,addGymPackage,addMembership,updateCourtBooking,updateAppointment,updateCafeOrder,addTransaction,addProduct,adjustStock,addContent,publishContent,addStudent,addSchedule,metrics}}>{children}</C.Provider>;
}
export const useOperations=()=>{const c=useContext(C);if(!c)throw Error('OperationsProvider missing');return c};
