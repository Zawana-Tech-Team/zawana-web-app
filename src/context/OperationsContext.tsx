
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Appointment, BadmintonPackage, CafeCashTransactionInput, CafeOrder, ContentItem, CourtBooking, GymPackage, InventoryTransaction, MembershipRecord, Schedule, StoreOrder, StoreProduct, Student, Transaction, ManagedCourt, CoachProfile, ProductCategory, CafeMenuItem } from "../types";
import { get, post, patch, del } from "../api";
import { useAuth } from "./AuthContext";

type Ops={
 badmintonPackages:BadmintonPackage[]; badmintonEnrollments:any[]; gymPackages:GymPackage[]; memberships:MembershipRecord[];
 managedCourts:ManagedCourt[]; coaches:CoachProfile[]; courtBookings:CourtBooking[]; appointments:Appointment[]; schedules:Schedule[];
 products:StoreProduct[]; categories:ProductCategory[]; inventory:InventoryTransaction[]; storeOrders:StoreOrder[]; cafeOrders:CafeOrder[]; menu:CafeMenuItem[]; transactions:Transaction[]; content:ContentItem[]; students:Student[];
 addBadmintonPackage:(p:Omit<BadmintonPackage,"id">)=>Promise<void>;
 updateBadmintonPackage:(id:string,p:Partial<BadmintonPackage>)=>Promise<void>;
 deleteBadmintonPackage:(id:string)=>Promise<void>;
 addGymPackage:(p:Omit<GymPackage,"id">)=>Promise<void>;
 updateGymPackage:(id:string,p:Partial<GymPackage>)=>Promise<void>;
 deleteGymPackage:(id:string)=>Promise<void>;
 addMembership:(m:Omit<MembershipRecord,"id">)=>Promise<void>;
 updateCourtBooking:(id:string,status:CourtBooking["status"])=>Promise<void>;
 updateAppointment:(id:string,status:Appointment["status"])=>Promise<void>;
 updateCafeOrder:(id:string,status:CafeOrder["status"])=>Promise<void>;
 addTransaction:(t:Omit<Transaction,"id">|CafeCashTransactionInput)=>Promise<void>;
 addProduct:(p:Omit<StoreProduct,"id">)=>Promise<void>;
 updateProduct:(id:string,p:Partial<StoreProduct>)=>Promise<void>;
 deleteProduct:(id:string)=>Promise<void>;
 addCategory:(c:Omit<ProductCategory,"id">)=>Promise<void>;
 updateCategory:(id:string,c:Partial<ProductCategory>)=>Promise<void>;
 deleteCategory:(id:string)=>Promise<void>;
 addMenuItem:(m:Omit<CafeMenuItem,"id">)=>Promise<void>;
 updateMenuItem:(id:string,m:Partial<CafeMenuItem>)=>Promise<void>;
 deleteMenuItem:(id:string)=>Promise<void>;
 addStoreOrder:(o:Omit<StoreOrder,"id"> & {paymentMethod:"Cash"|"KPay"|"Pay Later"; itemSummary?:string})=>Promise<void>;
 adjustStock:(productId:string,quantity:number,note:string)=>Promise<void>;
 addContent:(c:Omit<ContentItem,"id">)=>Promise<void>;
 updateContent:(id:string,c:Partial<ContentItem>)=>Promise<void>;
 deleteContent:(id:string)=>Promise<void>;
 publishContent:(id:string)=>Promise<void>;
 addStudent:(s:Omit<Student,"id">)=>Promise<void>;
 updateStudent:(id:string,s:Partial<Student>)=>Promise<void>;
 deleteStudent:(id:string)=>Promise<void>;
 addSchedule:(s:Omit<Schedule,"id">)=>Promise<void>;
 updateSchedule:(id:string,s:Partial<Schedule>)=>Promise<void>;
 addCourt:(c:Omit<ManagedCourt,"id">)=>Promise<void>;
 updateCourt:(id:string,c:Partial<ManagedCourt>)=>Promise<void>;
 addCoach:(c:Omit<CoachProfile,"id">)=>Promise<void>;
 updateCoach:(id:string,c:Partial<CoachProfile>)=>Promise<void>;
 metrics:{todayRevenue:number;monthlyRevenue:number;pendingBookings:number;appointmentsToday:number;lowStock:number};
 loading:boolean; loadError:string;
 refresh:()=>Promise<void>;
};
const C=createContext<Ops|null>(null);

export function OperationsProvider({children}:{children:ReactNode}){
 const {user}=useAuth();
 const [state,setState]=useState<any>({badmintonPackages:[],badmintonEnrollments:[],gymPackages:[],memberships:[],managedCourts:[],coaches:[],courtBookings:[],appointments:[],schedules:[],products:[],categories:[],inventory:[],storeOrders:[],cafeOrders:[],menu:[],transactions:[],content:[],students:[]});
 const [loading,setLoading]=useState(false); const [loadError,setLoadError]=useState('');

 const refresh=async()=>{
   if(!user)return;
   setLoading(true);setLoadError('');
   const role=user.role;
   const canInventory=role==='admin'||role==='owner'||role==='store_fo';
   const canBadminton=role==='admin'||role==='owner'||role==='badminton_fo';
   const canGym=role==='admin'||role==='owner'||role==='gym_fo';
   const canTransactions=['admin','owner','gym_fo','badminton_fo','clinic_fo','store_fo','cafe_fo'].includes(role);
   const canSchedules=['admin','clinic_fo','doctor'].includes(role);
   const canCoaches=['admin','owner','gym_fo','badminton_fo','member'].includes(role);
   const canAppointments=['admin','clinic_fo','doctor','member'].includes(role);
   const canBookings=['admin','owner','gym_fo','badminton_fo','clinic_fo','coach','member'].includes(role);
   const canCourts=['admin','owner','badminton_fo','member'].includes(role);
   const results=await Promise.allSettled([
      canBadminton||role==='member'?get<any[]>("/packages/badminton"):Promise.resolve([]),canGym?get<any[]>("/packages/gym"):Promise.resolve([]),canGym?get<any[]>("/memberships"):Promise.resolve([]),
     canCourts?get<any[]>("/courts"):Promise.resolve([]),canCoaches?get<any[]>("/coaches"):Promise.resolve([]),canBookings?get<any[]>("/bookings"):Promise.resolve([]),canAppointments?get<any[]>("/appointments"):Promise.resolve([]),
      canSchedules?get<any[]>("/schedules"):Promise.resolve([]),canInventory?get<any[]>("/products"):Promise.resolve([]),canInventory?get<any[]>("/inventory"):Promise.resolve([]),canInventory?get<any[]>("/store/categories"):Promise.resolve([]),canInventory?get<any[]>("/store/orders"):Promise.resolve([]),['admin','owner','cafe_fo'].includes(role)?get<any[]>("/cafe/orders"):Promise.resolve([]),['admin','owner','cafe_fo','member'].includes(role)?get<any[]>("/menu"):Promise.resolve([]),
      canTransactions?get<any[]>("/transactions"):Promise.resolve([]),['admin','owner'].includes(role)?get<any[]>("/admin/content"):['member'].includes(role)?get<any[]>("/content"):Promise.resolve([]),canBadminton?get<any[]>("/badminton/enrollments"):Promise.resolve([])
   ]);
   const val=(i:number)=>results[i].status==="fulfilled"?results[i].value:[];
   const bookings=val(5);
   setState({
     badmintonPackages:val(0),badmintonEnrollments:val(16),gymPackages:val(1),memberships:val(2),managedCourts:val(3),coaches:val(4),
     courtBookings:bookings.filter((b:any)=>b.kind==="court").map((b:any)=>{let meta:any={};try{meta=b.meta?JSON.parse(b.meta):{}}catch{};return {id:b.id,customer:meta.customerName||b.user?.name||"Member",court:b.court?.name||b.title,date:b.date,time:b.time,session:60,price:b.price,paymentStatus:b.paymentStatus,status:b.status}}),
     appointments:val(6),schedules:val(7),
     products:val(8),inventory:val(9),categories:val(10),storeOrders:val(11),cafeOrders:val(12),menu:val(13),transactions:val(14),content:val(15),students:[]
   });
   const failed=results.filter(x=>x.status==='rejected') as PromiseRejectedResult[];
   if(failed.length)setLoadError(failed[0].reason?.message||'Some operations data could not be loaded.');
   setLoading(false);
 };
 useEffect(()=>{refresh().catch(console.error)},[user?.id]);

 const action=async(fn:()=>Promise<unknown>)=>{await fn();await refresh()};
 const addBadmintonPackage=(p:any)=>action(()=>post("/packages/badminton",p).then(()=>undefined));
 const updateBadmintonPackage=(id:string,p:any)=>action(()=>patch(`/packages/badminton/${id}`,p).then(()=>undefined));
 const deleteBadmintonPackage=(id:string)=>action(()=>del(`/packages/badminton/${id}`));
 const addGymPackage=(p:any)=>action(()=>post("/packages/gym",p).then(()=>undefined));
 const updateGymPackage=(id:string,p:any)=>action(()=>patch(`/packages/gym/${id}`,p).then(()=>undefined));
 const deleteGymPackage=(id:string)=>action(()=>del(`/packages/gym/${id}`));
 const addMembership=(m:any)=>action(()=>post("/memberships",m).then(()=>undefined));
 const updateCourtBooking=(id:string,status:any)=>action(()=>patch(`/bookings/${id}/status`,{status}).then(()=>undefined));
 const updateAppointment=(id:string,status:any)=>action(()=>patch(`/appointments/${id}/status`,{status}).then(()=>undefined));
 const updateCafeOrder=(id:string,status:any)=>action(()=>patch(`/cafe/orders/${id}/status`,{status}).then(()=>undefined));
 const addTransaction=(t:any)=>action(()=>post("/transactions",t).then(()=>undefined));
 const addProduct=(p:any)=>action(()=>post("/products",p).then(()=>undefined));
 const addCategory=(c:any)=>action(()=>post("/store/categories",c).then(()=>undefined));
 const updateCategory=(id:string,c:any)=>action(()=>patch(`/store/categories/${id}`,c).then(()=>undefined));
 const deleteCategory=(id:string)=>action(()=>del(`/store/categories/${id}`));
 const addMenuItem=(m:any)=>action(()=>post("/menu",m).then(()=>undefined));
 const updateMenuItem=(id:string,m:any)=>action(()=>patch(`/menu/${id}`,m).then(()=>undefined));
 const deleteMenuItem=(id:string)=>action(()=>del(`/menu/${id}`));
 const addStoreOrder=(o:any)=>action(()=>post("/store/orders",o).then(()=>undefined));
 const updateProduct=(id:string,p:any)=>action(()=>patch(`/products/${id}`,p).then(()=>undefined));
 const deleteProduct=(id:string)=>action(()=>del(`/products/${id}`));
 const adjustStock=(id:string,quantity:number,note:string)=>action(()=>post(`/products/${id}/stock`,{quantity,note}).then(()=>undefined));
 const addContent=(c:any)=>action(()=>post("/content",c).then(()=>undefined));
 const updateContent=(id:string,c:any)=>action(()=>patch(`/content/${id}`,c).then(()=>undefined));
 const deleteContent=(id:string)=>action(()=>del(`/content/${id}`));
 const publishContent=(id:string)=>action(()=>patch(`/content/${id}/publish`,{}).then(()=>undefined));
 const addStudent=(s:any)=>action(()=>post("/students",s).then(()=>undefined));
 const updateStudent=(id:string,s:any)=>action(()=>patch(`/students/${id}`,s).then(()=>undefined));
 const deleteStudent=(id:string)=>action(()=>del(`/students/${id}`));
 const addSchedule=(s:any)=>action(()=>post("/schedules",s).then(()=>undefined));
 const updateSchedule=(id:string,s:any)=>action(()=>patch(`/schedules/${id}`,s).then(()=>undefined));
 const addCourt=(c:any)=>action(()=>post("/courts",c).then(()=>undefined));
 const updateCourt=(id:string,c:any)=>action(()=>patch(`/courts/${id}`,c).then(()=>undefined));
 const addCoach=(c:any)=>action(()=>post("/coaches",c).then(()=>undefined));
 const updateCoach=(id:string,c:any)=>action(()=>patch(`/coaches/${id}`,c).then(()=>undefined));

 const metrics=useMemo(()=>({
   todayRevenue:state.transactions.filter((t:any)=>t.date===new Date().toISOString().slice(0,10)&&t.status==="paid").reduce((a:number,t:any)=>a+t.finalAmount,0),
   monthlyRevenue:state.transactions.filter((t:any)=>String(t.date).startsWith(new Date().toISOString().slice(0,7))&&t.status==="paid").reduce((a:number,t:any)=>a+t.finalAmount,0),
   pendingBookings:state.courtBookings.filter((b:any)=>b.status==="pending").length,
   appointmentsToday:state.appointments.filter((a:any)=>a.date===new Date().toISOString().slice(0,10)).length,
   lowStock:state.products.filter((p:any)=>p.stock<=5&&p.status==="active").length
 }),[state]);

 return <C.Provider value={{...state,addBadmintonPackage,updateBadmintonPackage,deleteBadmintonPackage,addGymPackage,updateGymPackage,deleteGymPackage,addMembership,updateCourtBooking,updateAppointment,updateCafeOrder,addTransaction,addProduct,updateProduct,deleteProduct,addCategory,updateCategory,deleteCategory,addMenuItem,updateMenuItem,deleteMenuItem,addStoreOrder,adjustStock,addContent,updateContent,deleteContent,publishContent,addStudent,updateStudent,deleteStudent,addSchedule,updateSchedule,addCourt,updateCourt,addCoach,updateCoach,metrics,loading,loadError,refresh}}>{children}</C.Provider>
}
export const useOperations=()=>{const c=useContext(C);if(!c)throw Error("OperationsProvider missing");return c};
