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

export function Recovery(){const services=['Sports Massage','Physiotherapy','Mobility Assessment','Recovery Session','Injury Assessment','Ice Recovery'];return <Page title="Recovery center" eyebrow="Recover deliberately"><div className="grid gap-4 md:grid-cols-3">{services.map((s,i)=><Card key={s} className="p-6"><Badge>{i%2?'Assessment':'Recovery'}</Badge><h3 className="mt-4 text-xl font-black">{s}</h3><p className="mt-2 text-sm text-zawana-500">Professional recovery support for training and performance.</p><p className="mt-5 font-black">{[30000,45000,25000,20000,35000,15000][i].toLocaleString()} MMK</p><Button className="mt-5 w-full">Book service</Button></Card>)}</div></Page>}
