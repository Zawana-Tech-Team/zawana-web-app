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

export function Performance(){return <Page title="Athlete performance" eyebrow="Performance lab"><div className="grid gap-4 md:grid-cols-5"><Stat label="Body weight" value="70.0 KG"/><Stat label="Squat" value="120 KG"/><Stat label="Bench" value="80 KG"/><Stat label="Deadlift" value="150 KG"/><Stat label="Vertical" value="52 CM"/></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Card className="p-6"><h3 className="font-black">Squat progression</h3><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={performance}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Line type="monotone" dataKey="value" stroke="#C4AF49" strokeWidth={3} dot={{r:4}}/></LineChart></ResponsiveContainer></div></Card><Card className="p-6"><h3 className="font-black">Training volume</h3><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:'W1',value:12},{name:'W2',value:18},{name:'W3',value:15},{name:'W4',value:22},{name:'W5',value:19},{name:'W6',value:25}]}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Bar dataKey="value" fill="#C4AF49" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Card></div><Card className="mt-6 p-6"><h3 className="font-black">Personal records</h3><div className="mt-4 grid gap-3 md:grid-cols-3">{[['Squat','120 KG'],['Deadlift','150 KG'],['Bench Press','80 KG'],['Vertical Jump','52 CM'],['10M Sprint','1.82 SEC'],['3KM','15:00']].map(([a,b])=><div key={a} className="rounded-xl bg-zawana-950/4 p-4"><p className="text-xs text-zawana-500">{a}</p><p className="mt-1 text-xl font-black">{b}</p></div>)}</div></Card></Page>}
