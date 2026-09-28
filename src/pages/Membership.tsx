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

export function Membership(){const [selected,setSelected]=useState('athlete');return <Page title="Membership" eyebrow="Your access"><Card className="mb-6 p-6"><div className="flex flex-col justify-between gap-5 md:flex-row"><div><Badge good>Active</Badge><h2 className="mt-3 text-3xl font-black">Athlete membership</h2><p className="mt-2 text-sm text-zawana-500">24 Sep 2026 → 24 Oct 2026 · 12 sessions remaining</p></div><Button>Renew membership</Button></div></Card><div className="grid gap-4 md:grid-cols-3">{memberships.map(m=><Card key={m.id} className={`p-6 ${selected===m.id?'border-zawana-accent':''}`}><div className="flex justify-between"><h3 className="text-xl font-black">{m.name}</h3>{selected===m.id&&<Badge good>Current</Badge>}</div><p className="mt-5 text-3xl font-black">{m.price.toLocaleString()} <span className="text-sm text-zawana-500">MMK</span></p><ul className="my-6 space-y-3">{m.features.map(f=><li className="flex gap-2 text-sm text-zawana-500" key={f}><Check size={15} className="text-zawana-accent"/>{f}</li>)}</ul><Button onClick={()=>setSelected(m.id)} variant={selected===m.id?'secondary':'primary'} className="w-full">{selected===m.id?'Current plan':'Choose plan'}</Button></Card>)}</div></Page>}
