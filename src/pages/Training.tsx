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

export function Training(){const [done,setDone]=useState<string[]>([]);const workouts=[['MON','Lower Strength','4 exercises'],['TUE','Zone 2','30 min'],['WED','Upper Strength','5 exercises'],['THU','Power','4 exercises'],['FRI','Badminton','90 min']];return <Page title="Training program" eyebrow="Athlete performance"><Card className="p-6"><div className="flex justify-between"><div><p className="text-xs font-bold tracking-widest text-zawana-accent">SAI — PERFORMANCE PROGRAM</p><h2 className="mt-2 text-2xl font-black">Week 01</h2></div><Badge>Active</Badge></div><div className="mt-6 space-y-3">{workouts.map(([day,title,meta])=><div key={day} className="flex items-center justify-between rounded-xl border border-zawana-950/8 p-4"><div className="flex items-center gap-4"><span className="w-10 text-xs font-black text-zawana-500">{day}</span><div><p className="font-bold">{title}</p><p className="text-xs text-zawana-500">{meta}</p></div></div><Button variant={done.includes(day)?'secondary':'primary'} onClick={()=>setDone(x=>x.includes(day)?x.filter(a=>a!==day):[...x,day])}>{done.includes(day)?'Completed':'Complete'}</Button></div>)}</div></Card><Card className="mt-6 p-6"><h3 className="font-black">Today's workout · Back Squat</h3><div className="mt-4 grid gap-3 md:grid-cols-3">{['4 × 5','Target 105 KG','Previous 100 KG'].map(x=><div key={x} className="rounded-xl bg-zawana-950/4 p-4 text-sm font-bold">{x}</div>)}</div></Card></Page>}
