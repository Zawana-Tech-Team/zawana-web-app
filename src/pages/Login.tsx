import type { ReactNode, FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ShoppingBag, Search } from 'lucide-react';
import { Button, Card, Badge, Page, Stat, Logo, Empty } from '../components/UI';
import { classes, courts, memberships, products, revenue, performance } from '../data';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip,
  BarChart, Bar
} from 'recharts';
import OptimizedImage from '../components/OptimizedImage';

export function Login(){const {login}=useAuth();const nav=useNavigate();const [email,setEmail]=useState('member@zawana.test');const [password,setPassword]=useState('password123');const [error,setError]=useState('');const submit=async(e:FormEvent)=>{e.preventDefault();setError('');const ok=await login(email,password);if(!ok){setError('Use a valid demo account and password123.');return}nav(email.includes('admin')?'/admin':email.includes('coach')?'/coach':'/dashboard')};return <AuthShell title="Welcome back."><form onSubmit={submit} className="space-y-4"><Field label="Email"><input required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Password"><input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>{error&&<p className="text-sm text-red-300">{error}</p>}<Button className="w-full">Login</Button><Button type="button" variant="secondary" className="w-full">Continue with Google</Button><p className="text-center text-sm text-zawana-500">Don't have an account? <Link className="font-bold text-zawana-950" to="/signup">Create one</Link></p><div className="rounded-xl bg-zawana-950/4 p-4 text-xs text-zawana-500">Demo: member@zawana.test · coach@zawana.test · admin@zawana.test<br/>Password: password123</div></form></AuthShell>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="block text-sm font-bold">{label}<div className="mt-2">{children}</div></label>}
function AuthShell({title,children}:{title:string;children:ReactNode}){
  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
    <div className="relative hidden overflow-hidden bg-zawana-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-zawana-gold/35"/>
      <div className="absolute -right-2 top-24 h-36 w-36 rounded-full border border-zawana-gold/25"/>
      <Logo/>
      <div className="relative max-w-xl">
        <p className="eyebrow text-zawana-gold">Badminton & sports arena</p>
        <h1 className="mt-6 text-7xl font-black leading-[.87] tracking-[-.07em]">PLAY.<br/>TRAIN.<br/><span className="text-zawana-gold">PERFORM.</span></h1>
        <p className="mt-8 max-w-lg text-base leading-7 text-white/65">A premium training environment for players, athletes and people who love to move.</p>
      </div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-white/45">Yangon · Est. 2022</p>
    </div>
    <div className="flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <div className="mb-8 lg:hidden"><Logo/></div>
        <p className="eyebrow text-zawana-gold">The Zawana</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-.05em]">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  </div>
}
