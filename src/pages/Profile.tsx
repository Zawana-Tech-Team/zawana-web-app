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

export function Profile(){const {user}=useAuth();const [name,setName]=useState(user?.name||'');return <Page title="Profile" eyebrow="Your Zawana identity"><Card className="max-w-3xl p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-zawana-accent text-xl font-black text-zawana-950">{name.slice(0,2).toUpperCase()}</div><div><h2 className="text-2xl font-black">{name}</h2><p className="text-sm text-zawana-500">{user?.email}</p></div></div><div className="mt-8 grid gap-5 md:grid-cols-2"><label className="text-sm font-bold">Name<input value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none focus:border-zawana-accent"/></label><label className="text-sm font-bold">Phone<input defaultValue="09 000 000 000" className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"/></label><label className="text-sm font-bold">Primary sport<select className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"><option>Badminton</option><option>Fitness</option><option>Athlete Performance</option></select></label><label className="text-sm font-bold">Goal<input defaultValue="Performance" className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"/></label></div><Button className="mt-6">Save profile</Button></Card></Page>}
