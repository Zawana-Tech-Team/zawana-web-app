
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Appointment, BadmintonPackage, CafeOrder, ContentItem, CourtBooking, GymPackage, InventoryTransaction, MembershipRecord, Schedule, StoreOrder, StoreProduct, Student, Transaction, ManagedCourt, CoachProfile } from "../types";
import { get, post, patch, del } from "../api";
import { useAuth } from "./AuthContext";

type Ops={
 badmintonPackages:BadmintonPackage[]; gymPackages:GymPackage[]; memberships:MembershipRecord[];
 managedCourts:ManagedCourt[]; coaches:CoachProfile[]; courtBookings:CourtBooking[]; appointments:Appointment[]; schedules:Schedule[];
 products:StoreProduct[]; inventory:InventoryTransaction[]; storeOrders:StoreOrder[]; cafeOrders:CafeOrder[]; transactions:Transaction[]; content:ContentItem[]; students:Student[];
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
 addTransaction:(t:Omit<Transaction,"id">)=>Promise<void>;
 addProduct:(p:Omit<StoreProduct,"id">)=>Promise<void>;
 updateProduct:(id:string,p:Partial<StoreProduct>)=>Promise<void>;
 deleteProduct:(id:string)=>Promise<void>;
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
 refresh:()=>Promise<void>;
};
const C=createContext<Ops|null>(null);

export function OperationsProvider({children}:{children:ReactNode}){
 const {user}=useAuth();
 const [state,setState]=useState<any>({badmintonPackages:[],gymPackages:[],memberships:[],managedCourts:[],coaches:[],courtBookings:[],appointments:[],schedules:[],products:[],inventory:[],storeOrders:[],cafeOrders:[],transactions:[],content:[],students:[]});

 const refresh=async()=>{
   if(!user)return;
   const results=await Promise.allSettled([
     get<any[]>("/packages/badminton"),get<any[]>("/packages/gym"),get<any[]>("/memberships"),
     get<any[]>("/courts"),get<any[]>("/coaches"),get<any[]>("/bookings"),get<any[]>("/appointments"),
     get<any[]>("/schedules"),get<any[]>("/products"),get<any[]>("/inventory"),get<any[]>("/cafe/orders"),
     get<any[]>("/transactions"),get<any[]>("/content"),get<any[]>("/students")
   ]);
   const val=(i:number)=>results[i].status==="fulfilled"?results[i].value:[];
   const bookings=val(5);
   setState({
     badmintonPackages:val(0),gymPackages:val(1),memberships:val(2),managedCourts:val(3),coaches:val(4),
     courtBookings:bookings.filter((b:any)=>b.kind==="court").map((b:any)=>({id:b.id,customer:b.user?.name||"Member",court:b.court?.name||b.title,date:b.date,time:b.time,session:60,price:b.price,paymentStatus:b.paymentStatus,status:b.status})),
     appointments:val(6),schedules:val(7),
     products:val(8),inventory:val(9),storeOrders:[],cafeOrders:val(10),transactions:val(11),content:val(12),students:val(13)
   });
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
   todayRevenue:state.transactions.filter((t:any)=>t.date==="2026-09-29"&&t.status==="paid").reduce((a:number,t:any)=>a+t.finalAmount,0),
   monthlyRevenue:state.transactions.reduce((a:number,t:any)=>a+t.finalAmount,0),
   pendingBookings:state.courtBookings.filter((b:any)=>b.status==="pending").length,
   appointmentsToday:state.appointments.filter((a:any)=>a.date==="2026-09-29").length,
   lowStock:state.products.filter((p:any)=>p.stock<=5&&p.status==="active").length
 }),[state]);

 return <C.Provider value={{...state,addBadmintonPackage,updateBadmintonPackage,deleteBadmintonPackage,addGymPackage,updateGymPackage,deleteGymPackage,addMembership,updateCourtBooking,updateAppointment,updateCafeOrder,addTransaction,addProduct,updateProduct,deleteProduct,adjustStock,addContent,updateContent,deleteContent,publishContent,addStudent,updateStudent,deleteStudent,addSchedule,updateSchedule,addCourt,updateCourt,addCoach,updateCoach,metrics,refresh}}>{children}</C.Provider>
}
export const useOperations=()=>{const c=useContext(C);if(!c)throw Error("OperationsProvider missing");return c};
