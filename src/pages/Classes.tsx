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

export function Classes() {
  const [booked, setBooked] = useState<string[]>([]);
  return <Page title="Classes" eyebrow="Train together">
    <div className="grid gap-4 md:grid-cols-3">
      {classes.map(c =>
        <Card key={c.id} className="p-6">
          <div className="flex justify-between">
            <Badge>{c.level}</Badge>
            <span className="text-sm font-bold">{c.price.toLocaleString()} MMK</span>
          </div>
          <h3 className="mt-4 text-xl font-black">{c.title}</h3>
          <p className="mt-2 text-sm text-zawana-500">
            {c.coach} · {c.time} · {c.duration} min</p>
          <p className="mt-2 text-sm text-zawana-500">
            {c.booked}/{c.capacity} spots · {c.location}
          </p>
          <Button
            className="mt-5 w-full"
            disabled={c.booked >= c.capacity}
            onClick={() => setBooked(x => [...x, c.id])}
          >
            {booked.includes(c.id)
              ? 'Booked'
              : c.booked >= c.capacity
                ? 'Join waitlist'
                : 'Book class'}
          </Button>
        </Card>
      )}
    </div>
  </Page>
}
