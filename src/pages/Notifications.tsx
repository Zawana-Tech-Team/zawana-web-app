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

export function Notifications(){const {notifications}=useApp();return <Page title="Notifications" eyebrow="Stay in the loop"><div className="space-y-3">{notifications.map(n=><Card key={n.id} className={`p-5 ${!n.read?'border-zawana-accent/30':''}`}><div className="flex justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="font-black">{n.title}</h3>{!n.read&&<Badge good>New</Badge>}</div><p className="mt-2 text-sm text-zawana-500">{n.body}</p></div><span className="whitespace-nowrap text-xs text-zawana-500">{n.time}</span></div></Card>)}</div></Page>}
