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

export function Home(){
  const facilities = [
  {
    name: 'Badminton Courts',
    image: '/facilities/court.webp',
  },
  {
    name: 'High Performance Gym',
    image: '/facilities/gym.webp',
  },
  {
    name: 'Training Studio',
    image: '/facilities/gx-studio.webp',
  },
  {
    name: 'Cut Lab',
    image: '/facilities/cutlab.webp',
  },
  {
    name: 'Zawana Cafe',
    image: '/facilities/cafe.webp',
  },
  {
    name: 'Revive Clinic',
    image: '/facilities/revive.webp',
  },
];

  return <div className="overflow-hidden bg-white text-zawana-950">
    <header className="absolute left-0 right-0 top-0 z-30 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-10">
      <Logo/>
      <nav className="hidden items-center gap-8 text-[11px] font-extrabold uppercase tracking-[.18em] text-zawana-500 lg:flex">
        <a href="#arena" className="transition hover:text-zawana-950">The Arena</a>
        <a href="#membership" className="transition hover:text-zawana-950">Membership</a>
        <a href="#performance" className="transition hover:text-zawana-950">Performance</a>
        <a href="#community" className="transition hover:text-zawana-950">Community</a>
      </nav>
      <div className="flex items-center gap-2">
        <Link to="/login" className="hidden rounded-full px-4 py-2.5 text-sm font-bold text-zawana-950 sm:block">Log in</Link>
        <Link to="/signup"><Button>Join Zawana</Button></Link>
      </div>
    </header>

    <main>
      <section className="sport-grid relative min-h-[760px] overflow-hidden border-b border-zawana-950/8 pt-28 md:min-h-[850px] md:pt-32">

        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_26%,rgba(196,175,73,.13),transparent_24%),linear-gradient(180deg,rgba(255,255,255,.2),rgba(247,247,248,.55))]" />

        <div className="hero-orb pointer-events-none right-[-6rem] top-24 hidden opacity-80 lg:block" />

        {/* Decorative shape */}
        <div className="absolute right-[-2rem] top-[18rem] h-[22rem] w-[22rem] rotate-[11deg] rounded-[48px] bg-zawana-950 md:right-[7%] md:w-[26rem]" />

        {/* Arena card */}
        <div className="absolute right-[4%] top-[20rem] z-10 hidden h-[24rem] w-[26rem] rounded-[34px] border border-white/20 bg-zawana-950 p-6 text-white shadow-2xl md:block lg:p-8 court-lines">

          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow text-zawana-gold">
                Arena 01
              </p>

              <p className="mt-2 text-sm font-semibold text-white/70">
                Train / play / recover
              </p>
            </div>

            <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/70">
              Yangon
            </span>
          </div>

          <div className="mt-12 rounded-[26px] border border-white/20 p-4">

            <div className="relative h-40 overflow-hidden rounded-[18px] border border-white/20">

              <div className="absolute inset-x-[14%] bottom-0 top-0 border-x border-white/25" />

              <div className="absolute left-0 right-0 top-1/2 border-t border-white/25" />

              <div className="absolute bottom-[25%] left-[25%] right-[25%] top-[25%] border border-white/25" />

              <div className="absolute bottom-[25%] left-1/2 top-[25%] border-l border-dashed border-white/20" />

            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center">

              <div>
                <p className="text-xl font-black">6</p>
                <p className="mt-1 text-[9px] uppercase tracking-[.15em] text-white/50">
                  Courts
                </p>
              </div>

              <div>
                <p className="text-xl font-black">24/7</p>
                <p className="mt-1 text-[9px] uppercase tracking-[.15em] text-white/50">
                  Access*
                </p>
              </div>

              <div>
                <p className="text-xl font-black">01</p>
                <p className="mt-1 text-[9px] uppercase tracking-[.15em] text-white/50">
                  Community
                </p>
              </div>

            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-xs">
            <span className="text-white/55">
              * Membership dependent
            </span>

            <span className="font-bold text-zawana-gold">
              PASSION FIRST
            </span>
          </div>

        </div>

        {/* Hero content */}
        <div className="relative mx-auto max-w-[1440px] px-5 md:px-10">

          <div className="max-w-[820px] pt-4 md:pt-12">

            <p className="eyebrow text-zawana-gold">
              The Zawana Badminton Arena · Est. 2022
            </p>

            <div className="gold-rule mt-5" />

            <h1 className="display-title mt-6 text-6xl md:text-8xl lg:text-[9.4rem]">
              PLAY.
              <br />
              TRAIN.
              <br />
              <span className="text-zawana-gold">
                PERFORM.
              </span>
            </h1>

            <p className="mt-8 max-w-[600px] text-base font-medium leading-7 text-zawana-500 md:text-lg">
              A premium sports environment built around movement, training and
              the ambition to grow Myanmar&apos;s next generation of athletes.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/book">
                <Button>
                  Book a court
                  <ArrowRight className="ml-2" size={16} />
                </Button>
              </Link>

              <Link to="/facilities">
                <Button variant="secondary">
                  Explore the arena
                </Button>
              </Link>
            </div>

          </div>

          {/* Partners */}
          <div className="mt-24 pb-10 md:mt-32 md:pb-12">

            <div className="mb-6 flex items-end justify-between">

              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-zawana-500">
                  Trusted by
                </p>

                <h2 className="mt-2 text-xl font-black tracking-[-0.04em] md:text-2xl">
                  Our Partners
                </h2>
              </div>

              <p className="hidden text-xs font-medium text-zawana-500 md:block">
                Building sport together.
              </p>

            </div>

            <div className="grid overflow-hidden rounded-[26px] border border-zawana-950/10 bg-white sm:grid-cols-2 lg:grid-cols-4">

              {[
                {
                  name: "MAI",
                  logo: "/partners/partner-1.png",
                },
                {
                  name: "ROYAL-D",
                  logo: "/partners/partner-2.PNG",
                },
                {
                  name: "LI-NING",
                  logo: "/partners/partner-3.PNG",
                },
                {
                  name: "Hundred",
                  logo: "/partners/partner-4.PNG",
                },
              ].map((partner, index) => (
                <div
                  key={partner.name}
                  className={`
                    group flex min-h-[120px] items-center justify-center
                    border-zawana-950/10 p-8
                    transition-colors duration-300
                    hover:bg-zawana-50
                    md:min-h-[150px]
                    ${index < 3 ? "lg:border-r" : ""}
                    ${index % 2 === 0 ? "sm:border-r lg:border-r" : ""}
                  `}
                >
                  <OptimizedImage
                    src={partner.logo}
                    alt={`${partner.name} logo`}
                    loading="lazy"
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="
                    h-20 w-auto max-w-[260px]
                    object-contain
                    grayscale opacity-65
                    transition-all duration-300
                    group-hover:grayscale-0
                    group-hover:opacity-100
                    md:h-24 md:max-w-[320px]
                    lg:h-28 lg:max-w-[360px]
                  "
                  />
                </div>
              ))}

            </div>

          </div>

        </div>

      </section>

      <section id="arena" className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-32">
        <div className="max-w-3xl">
          <p className="eyebrow text-zawana-gold">01 · The arena</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-6xl">One arena.<br/>Multiple ways to move.</h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-zawana-500 md:text-lg">Every part of Zawana is designed to make training easier to start, easier to sustain and harder to outgrow.</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {facilities.map((facility) => (
            <Card
              key={facility.name}
              className="group relative min-h-[360px] overflow-hidden p-0 transition duration-500 hover:-translate-y-1 hover:shadow-2xl"
            >
              {/* Image */}
              <OptimizedImage
                src={facility.image}
                alt={facility.name}
                loading="lazy"
                sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />

              {/* Dark gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-zawana-950 via-zawana-950/45 to-transparent" />

              {/* Content */}
              <div className="relative flex h-full min-h-[360px] flex-col justify-end p-7 text-white">
                <div className="mb-6 h-1 w-12 bg-zawana-gold transition-all duration-500 group-hover:w-20" />

                <h3 className="text-2xl font-black tracking-[-.04em]">
                  {facility.name}
                </h3>

                <p className="mt-3 max-w-sm text-sm leading-6 text-white/65">
                  Purpose-built spaces for movement, technical practice and
                  long-term athlete development.
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="performance" className="bg-zawana-950 px-5 py-24 text-white md:px-10 md:py-28">
        <div className="mx-auto grid max-w-[1440px] gap-14 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
          <div>
            <p className="eyebrow text-zawana-gold">02 · Performance</p>
            <h2 className="mt-5 text-4xl font-black tracking-[-.06em] md:text-7xl">Train with intention.<br/><span className="text-zawana-gold">Perform with confidence.</span></h2>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/65 md:text-lg">From court time to strength and conditioning, the Zawana experience connects the training floor, the coach and the athlete.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/training"><Button>See training</Button></Link>
              <Link to="/coaches"><Button variant="secondary">Meet the coaches</Button></Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-zawana-950/10 bg-zawana-950/10">
            <div className="bg-zawana-950/5 p-6 md:p-8"><p className="text-4xl font-black">01</p><p className="mt-3 text-sm font-bold text-white/70">Assessment-led</p></div>
            <div className="bg-zawana-950/5 p-6 md:p-8"><p className="text-4xl font-black">02</p><p className="mt-3 text-sm font-bold text-white/70">Coach-guided</p></div>
            <div className="bg-zawana-950/5 p-6 md:p-8"><p className="text-4xl font-black">03</p><p className="mt-3 text-sm font-bold text-white/70">Performance-minded</p></div>
            <div className="bg-zawana-gold p-6 text-zawana-950 md:p-8"><p className="text-4xl font-black">04</p><p className="mt-3 text-sm font-bold">Community-first</p></div>
          </div>
        </div>
      </section>

      <section id="membership" className="sport-grid border-b border-zawana-950/8 px-5 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="eyebrow text-zawana-gold">03 · Membership</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-6xl">Choose your access.</h2>
            </div>
            <Link to="/memberships" className="text-sm font-extrabold uppercase tracking-[.16em] text-zawana-950">Compare plans <ArrowRight className="ml-2 inline" size={16}/></Link>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {memberships.map((m,i)=><Card key={m.id} className={`${i===1?'border-zawana-gold shadow-[0_22px_60px_rgba(196,175,73,.15)]':''} p-7`}>
              <div className="flex items-start justify-between gap-4"><h3 className="text-2xl font-black tracking-[-.04em]">{m.name}</h3>{i===1&&<Badge good>Popular</Badge>}</div>
              <p className="mt-6 text-4xl font-black tracking-[-.06em]">{m.price.toLocaleString()} <span className="text-sm font-bold tracking-normal text-zawana-500">MMK / month</span></p>
              <ul className="my-8 space-y-3">{m.features.map(f=><li key={f} className="flex gap-2 text-sm text-zawana-500"><Check size={16} className="mt-0.5 shrink-0 text-zawana-gold"/>{f}</li>)}</ul>
              <Link to="/memberships"><Button variant={i===1?'primary':'secondary'} className="w-full">Explore plan</Button></Link>
            </Card>)}
          </div>
        </div>
      </section>

      <section id="community" className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <div>
            <p className="eyebrow text-zawana-gold">04 · Brand belief</p>
            <div className="gold-rule mt-5"/>
            <h2 className="mt-6 text-5xl font-black tracking-[-.07em] md:text-7xl">Passion first.<br/>Profit last.</h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-zawana-500">Zawana exists to create a stronger sporting culture in Myanmar and to give players the environment they need to grow.</p>
          </div>
          <div className="relative overflow-hidden rounded-[34px] bg-zawana-900 p-8 md:p-12">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-zawana-gold/30"/>
            <div className="absolute right-10 top-10 h-20 w-20 rounded-full border border-zawana-gold/25"/>
            <p className="max-w-2xl text-2xl font-black leading-tight tracking-[-.04em] md:text-4xl">“We are here to nurture talent, build community and help Myanmar athletes step onto a bigger stage.”</p>
            <div className="mt-10 flex items-center justify-between border-t border-zawana-950/10 pt-5 text-xs font-extrabold uppercase tracking-[.16em] text-zawana-500"><span>The Zawana</span><span>Est. 2022</span></div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-10 md:px-10 md:pb-14">
        <div className="mx-auto max-w-[1440px] overflow-hidden rounded-[34px] bg-zawana-950 px-6 py-12 text-white md:px-12 md:py-14">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div><p className="eyebrow text-zawana-gold">Ready when you are</p><h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-.06em] md:text-6xl">Your next session starts here.</h2></div>
            <Link to="/book"><Button>Book at Zawana <ArrowRight className="ml-2" size={16}/></Button></Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="border-t border-zawana-950/8 px-5 py-9 md:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-5 md:flex-row md:items-center"><Logo/><p className="text-xs font-semibold text-zawana-500">© 2026 THE ZAWANA · PLAY. TRAIN. PERFORM.</p></div>
    </footer>
  </div>
}
