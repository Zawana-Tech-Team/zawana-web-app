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
import { LanguageSwitcher } from '../context/LanguageContext';

export function Generic({title,body}:{title:string;body:string}){return <Page title={title} eyebrow="Zawana" actions={<LanguageSwitcher/>}><Card className="p-8"><p className="max-w-2xl text-zawana-500">{body}</p></Card></Page>}
