import type { ReactNode, FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ShoppingBag, Search } from 'lucide-react';
import { Button, Card, Badge, Page, Stat, Logo, Empty } from '../components/UI';
import { classes, courts, memberships, products, revenue, performance } from '../data';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar
} from 'recharts';
import OptimizedImage from '../components/OptimizedImage';

export function Store() {
  const { cart, addToCart } = useApp();
  return <Page
    title="Zawana store"
    eyebrow={`${cart.reduce((a, b) => a + b.quantity, 0)} items in cart`}
    actions={
      <Button variant="secondary">
        <ShoppingBag size={16} className="mr-2 inline" /> Cart</Button>
    }
  >
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map(p =>
        <Card key={p.id} className="overflow-hidden">
          <div className="grid h-48 place-items-center bg-zawana-950/4 text-6xl font-black text-zawana-950/10">Z</div>
          <div className="p-5">
            <p className="text-xs text-zawana-500">{p.category}</p>
            <h3 className="mt-1 font-black">{p.name}</h3>
            <p className="mt-2 text-sm text-zawana-500">{p.description}</p>
            <div className="mt-5 flex items-center justify-between">
              <b>{p.price.toLocaleString()} MMK</b>
              <Button onClick={() => addToCart(p.id)}>Add</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  </Page>
}
