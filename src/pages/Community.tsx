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

export function Community(){return <Page title="Zawana community" eyebrow="Move together"><div className="grid gap-4 lg:grid-cols-2">{['Athlete of the Month','September Challenge','Tournament Weekend','Performance Lab Notes'].map((x,i)=><Card key={x} className="overflow-hidden"><div className="h-40 bg-[linear-gradient(135deg,#15191a,#2a302d)]"/><div className="p-6"><p className="text-xs font-bold tracking-widest text-zawana-accent">{i%2?'COMMUNITY':'ZAWANA ATHLETE'}</p><h3 className="mt-2 text-2xl font-black">{x}</h3><p className="mt-2 text-sm text-zawana-500">Stories, challenges and practical education from inside the arena.</p></div></Card>)}</div></Page>}
