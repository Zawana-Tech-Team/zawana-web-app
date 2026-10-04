import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bell, CalendarDays, ChevronRight, LayoutDashboard, LogOut, Menu, Package, Users, X, ClipboardList, Dumbbell, HeartPulse, ShoppingBag, UtensilsCrossed, Stethoscope, BarChart3, FileText, CreditCard, Boxes, Trophy, UserRound } from 'lucide-react';
import { Logo } from './UI';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import type { UserRole } from '../types';

type Item={to:string;label:string;icon:any};
const configs:Record<Exclude<UserRole,'member'>,{label:string;eyebrow:string;items:Item[]}>={
 admin:{label:'Zawana Admin',eyebrow:'Central Management',items:[
  {to:'/admin',label:'Dashboard',icon:LayoutDashboard},{to:'/admin/users',label:'Users',icon:Users},{to:'/admin/badminton-packages',label:'Badminton Packages',icon:Package},{to:'/admin/gym-packages',label:'Gym Packages',icon:Dumbbell},{to:'/admin/coaches',label:'Coach Management',icon:UserRound},{to:'/admin/private-courses',label:'Private Courses',icon:CalendarDays},{to:'/admin/courts',label:'Court Rentals',icon:CalendarDays},{to:'/admin/finance',label:'Finance',icon:BarChart3},{to:'/admin/cms',label:'Content / Community',icon:FileText}
 ]},
 owner:{label:'Zawana Owner',eyebrow:'All Business Overview',items:[
  {to:'/owner',label:'Overview',icon:LayoutDashboard},{to:'/owner/finance',label:'Finance',icon:BarChart3}
 ]},
 badminton_fo:{label:'Badminton Front Office',eyebrow:'Court Operations',items:[
  {to:'/badminton-fo',label:'Dashboard',icon:LayoutDashboard},{to:'/badminton-fo/check-in',label:'Package Check-In & Sales',icon:ClipboardList},{to:'/badminton-fo/courts',label:'Court Rental Desk',icon:CalendarDays},{to:'/badminton-fo/bookings',label:'Court Bookings',icon:CalendarDays},{to:'/badminton-fo/pos',label:'POS',icon:ShoppingBag},{to:'/badminton-fo/transactions',label:'Transactions',icon:CreditCard}
 ]},
 gym_fo:{label:'HPC Gym Front Office',eyebrow:'Membership Operations',items:[
  {to:'/gym-fo',label:'Dashboard',icon:LayoutDashboard},{to:'/gym-fo/check-in',label:'Check-In',icon:ClipboardList},{to:'/gym-fo/members',label:'Members',icon:Users},{to:'/gym-fo/memberships',label:'Memberships',icon:Package},{to:'/gym-fo/appointments',label:'Appointments',icon:CalendarDays},{to:'/gym-fo/coaches',label:'Coaches',icon:Dumbbell},{to:'/gym-fo/payments',label:'Payments',icon:CreditCard}
 ]},
 clinic_fo:{label:'Revive Clinic Front Office',eyebrow:'Clinical Operations',items:[
  {to:'/clinic-fo',label:'Dashboard',icon:LayoutDashboard},{to:'/clinic-fo/patients',label:'Patients',icon:Users},{to:'/clinic-fo/appointments',label:'Appointments',icon:CalendarDays},{to:'/clinic-fo/doctors',label:'Doctors',icon:Stethoscope},{to:'/clinic-fo/schedule',label:'Doctor Schedule',icon:CalendarDays},{to:'/clinic-fo/records',label:'Records',icon:HeartPulse},{to:'/clinic-fo/payments',label:'Payments',icon:CreditCard}
 ]},
 store_fo:{label:'Lining Store',eyebrow:'Retail Operations',items:[
  {to:'/store-fo',label:'Dashboard',icon:LayoutDashboard},{to:'/store-fo/products',label:'Products',icon:Package},{to:'/store-fo/categories',label:'Categories',icon:Boxes},{to:'/store-fo/inventory',label:'Inventory',icon:Boxes},{to:'/store-fo/pos',label:'POS / Barcode',icon:ShoppingBag},{to:'/store-fo/orders',label:'Orders & Pay Later',icon:ClipboardList},{to:'/store-fo/transactions',label:'Transactions',icon:CreditCard}
 ]},
 cafe_fo:{label:'Zawana Cafe',eyebrow:'Cafe Operations',items:[
  {to:'/cafe',label:'Dashboard',icon:LayoutDashboard},{to:'/cafe/orders',label:'Orders',icon:ClipboardList},{to:'/cafe/menu',label:'Menu',icon:UtensilsCrossed},{to:'/cafe/pos',label:'POS',icon:ShoppingBag},{to:'/cafe/transactions',label:'Transactions',icon:CreditCard}
 ]},
 doctor:{label:'Doctor Portal',eyebrow:'My Clinical Workspace',items:[
  {to:'/doctor',label:'Dashboard',icon:LayoutDashboard},{to:'/doctor/schedule',label:'My Schedule',icon:CalendarDays},{to:'/doctor/appointments',label:'Bookings',icon:ClipboardList},{to:'/doctor/patients',label:'Patients',icon:Users},{to:'/doctor/profile',label:'Profile',icon:UserRound}
 ]},
 coach:{label:'Coach Portal',eyebrow:'My Coaching Workspace',items:[
  {to:'/coach',label:'Dashboard',icon:LayoutDashboard},{to:'/coach/schedule',label:'My Calendar',icon:CalendarDays},{to:'/coach/bookings',label:'Bookings',icon:ClipboardList},{to:'/coach/clients',label:'Customers',icon:Users}
 ]}
};
function ClockIcon(){return <CalendarDays size={18}/>}

export default function RoleLayout({role,children}:{role:Exclude<UserRole,'member'>;children:ReactNode}){
 const {user,logout}=useAuth(); const [open,setOpen]=useState(false); const location=useLocation(); const cfg=configs[role];
 return <div className="min-h-screen bg-zawana-50 text-zawana-950">
  {open&&<button aria-label="Close menu" className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={()=>setOpen(false)}/>}
  <aside className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-zawana-950/8 bg-white transition-transform lg:translate-x-0 ${open?'translate-x-0':'-translate-x-full'}`}>
   <div className="flex h-[76px] items-center justify-between border-b border-zawana-950/8 px-5"><Logo/><button className="rounded-lg p-2 lg:hidden" onClick={()=>setOpen(false)}><X size={18}/></button></div>
   <div className="px-4 py-5"><div className="rounded-2xl bg-zawana-950 p-4 text-white"><p className="text-[10px] font-black uppercase tracking-[.18em] text-white/50">{cfg.eyebrow}</p><p className="mt-1 text-sm font-black">{cfg.label}</p></div></div>
   <nav className="flex-1 overflow-y-auto px-4 pb-5 space-y-1">{cfg.items.map(i=><NavLink key={i.to} to={i.to} end className={({isActive})=>`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold ${isActive?'bg-zawana-950 text-white':'text-zawana-600 hover:bg-zawana-950/5'}`} onClick={()=>setOpen(false)}><i.icon size={17}/><span className="flex-1">{i.label}</span><ChevronRight size={14} className="opacity-30"/></NavLink>)}<NavLink to={`${cfg.items[0].to}/notifications`} className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold text-zawana-600 hover:bg-zawana-950/5"><Bell size={17}/>Notifications</NavLink></nav>
   <div className="border-t border-zawana-950/8 p-4"><div className="mb-3 rounded-xl bg-zawana-950/4 p-3"><p className="text-sm font-black">{user?.name}</p><p className="text-[10px] font-bold uppercase tracking-wider text-zawana-500">{role.replace('_',' ')}</p></div><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-sm font-bold text-zawana-500 hover:bg-zawana-950/5"><LogOut size={16}/>Sign out</button></div>
  </aside>
  <div className="min-h-screen lg:pl-[272px]"><header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-zawana-950/8 bg-white/90 px-5 backdrop-blur-xl lg:px-8"><button className="rounded-xl border p-2.5 lg:hidden" onClick={()=>setOpen(true)}><Menu size={18}/></button><div className="ml-auto flex items-center gap-3"><NotificationBell/><div className="hidden border-l pl-3 sm:block"><p className="text-xs font-black">{user?.name}</p><p className="text-[10px] font-bold uppercase tracking-wider text-zawana-500">{cfg.label}</p></div></div></header>{children}</div>
 </div>
}
