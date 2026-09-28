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

export function Bookings(){const {bookings,cancelBooking}=useApp();return <Page title="My bookings" eyebrow="Schedule"><div className="space-y-3">{bookings.map(b=><Card key={b.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><h3 className="font-black">{b.title}</h3><Badge good={b.status==='confirmed'}>{b.status}</Badge></div><p className="mt-2 text-sm text-zawana-500">{b.date} · {b.time} · {b.location}</p><p className="mt-1 text-xs text-zawana-500">{b.id}</p></div><div className="flex gap-2"><Button variant="secondary">View</Button>{b.status==='confirmed'&&<Button variant="danger" onClick={()=>cancelBooking(b.id)}>Cancel</Button>}</div></div></Card>)}{!bookings.length&&<Empty title="No upcoming bookings" body="Your next session starts with a court, class or recovery booking." action={<Link to="/book"><Button>Book now</Button></Link>}/>}</div></Page>}
