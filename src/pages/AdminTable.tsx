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

export function AdminTable({title,items}:{title:string;items:string[]}){return <Page title={title} eyebrow="Administration"><Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-zawana-950/8 p-5"><div className="flex items-center gap-2 rounded-xl border border-zawana-950/8 bg-zawana-950/3 px-3 py-2"><Search size={16} className="text-zawana-500"/><input placeholder="Search..." className="bg-transparent text-sm outline-none"/></div><Button>Add new</Button></div><div className="divide-y divide-zawana-950/8">{items.map((x,i)=><div key={x} className="grid gap-3 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"><div><b>{x}</b><p className="mt-1 text-xs text-zawana-500">ZW-{String(1200+i)}</p></div><span className="text-sm text-zawana-500">{i%2?'Active':'Premium'}</span><span className="text-sm text-zawana-500">28 Sep 2026</span><Button variant="secondary">View</Button></div>)}</div></Card></Page>}
