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

export function Admin(){return <Page title="Admin overview" eyebrow="Zawana operations"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Stat label="Active members" value="342" sub="+32 this month"/><Stat label="Today's check-ins" value="127"/><Stat label="Monthly revenue" value="48.5M" sub="MMK"/><Stat label="Court occupancy" value="78%"/><Stat label="New members" value="32"/><Stat label="Expiring" value="12"/></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Card className="p-6"><h3 className="font-black">Revenue · MMK millions</h3><div className="mt-5 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={revenue}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Line type="monotone" dataKey="value" stroke="#C4AF49" strokeWidth={3}/></LineChart></ResponsiveContainer></div></Card><Card className="p-6"><h3 className="font-black">Peak hours</h3><div className="mt-5 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:'8AM',value:42},{name:'10AM',value:55},{name:'12PM',value:38},{name:'4PM',value:71},{name:'6PM',value:94},{name:'8PM',value:86}]}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Bar dataKey="value" fill="#C4AF49" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Card></div></Page>}
