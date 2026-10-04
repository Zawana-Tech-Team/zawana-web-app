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
import { Field, AuthShell } from '../components/AuthShell';

export function Signup(){
 const {signup}=useAuth();const nav=useNavigate();const [step,setStep]=useState(1);const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const finish=async()=>{setBusy(true);setError('');try{await signup(name.trim(),email.trim(),password);nav('/member',{replace:true})}catch(e:any){setError(e.message||'Could not create your account. Please try again.')}finally{setBusy(false)}};
 return <AuthShell title={step<4?'Create your Zawana account.':'Welcome to Zawana.'}>
  <div className="mb-6 flex gap-1">{[1,2,3,4].map(i=><div key={i} className={`h-1 flex-1 rounded-full ${i<=step?'bg-zawana-accent':'bg-zawana-950/10'}`}/>)}</div>
  {step===1&&<div className="space-y-4"><Field label="Full name"><input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Sai Zay"/></Field><Field label="Email"><input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></Field><Button type="button" className="w-full" disabled={!name.trim()||!email.includes('@')} onClick={()=>setStep(2)}>Continue</Button></div>}
  {step===2&&<div className="space-y-3">{['Badminton','Fitness','Strength & Conditioning','Athlete Performance','Personal Training','Recovery'].map(x=><button type="button" key={x} onClick={()=>setStep(3)} className="w-full rounded-xl border border-zawana-950/8 p-4 text-left font-bold hover:border-zawana-accent">{x}</button>)}</div>}
  {step===3&&<div className="space-y-3">{['Improve fitness','Build strength','Improve badminton','Athlete performance','General health'].map(x=><button type="button" key={x} onClick={()=>setStep(4)} className="w-full rounded-xl border border-zawana-950/8 p-4 text-left font-bold hover:border-zawana-accent">{x}</button>)}</div>}
  {step===4&&<div className="space-y-4"><Field label="Create password"><input autoComplete="new-password" minLength={6} required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="button" className="w-full" disabled={busy||password.length<6} onClick={()=>void finish()}>{busy?'Creating account…':'Finish signup'}</Button></div>}
 </AuthShell>
}
