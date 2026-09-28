import type {ReactNode,FormEvent} from 'react';import {useState} from 'react';import {Link,useNavigate} from 'react-router-dom';import {ArrowRight,Check,Clock,MapPin,ShoppingBag,Search,Plus,Minus,CalendarDays} from 'lucide-react';import {Button,Card,Badge,Page,Stat,Logo,Empty} from '../components/UI';import {classes,courts,memberships,products,revenue,performance} from '../data';import {useAuth} from '../context/AuthContext';import {useApp} from '../context/AppContext';import {LineChart,Line,ResponsiveContainer,CartesianGrid,XAxis,YAxis,Tooltip,BarChart,Bar} from 'recharts';
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
                  <img
                  src={partner.logo}
                  alt={`${partner.name} logo`}
                  loading="lazy"
                  decoding="async"
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
              <img
                src={facility.image}
                alt={facility.name}
                loading="lazy"
                decoding="async"
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
export function Dashboard(){const {user}=useAuth();const {bookings}=useApp();return <Page title={`Good morning, ${user?.name?.split(' ')[0]||'Athlete'}.`} eyebrow="Member dashboard" actions={<Link to="/book"><Button>Book a session</Button></Link>}><div className="grid gap-4 md:grid-cols-3"><Stat label="Membership" value="Athlete" sub="ACTIVE · expires 24 Oct 2026"/><Stat label="Sessions" value="24" sub="+4 this month"/><Stat label="Streak" value="7 days" sub="Keep it going"/></div><div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]"><Card className="p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-widest text-zawana-accent">NEXT SESSION</p><h2 className="mt-2 text-2xl font-black">{bookings.find(b=>b.status==='confirmed')?.title||'No upcoming session'}</h2><p className="mt-2 text-sm text-zawana-500">{bookings.find(b=>b.status==='confirmed')?.date||'Book your next session'} · {bookings.find(b=>b.status==='confirmed')?.time||''}</p></div><Badge good>Confirmed</Badge></div><div className="mt-8 flex gap-2"><Link to="/bookings"><Button variant="secondary">View booking</Button></Link><Link to="/book"><Button>Book another</Button></Link></div></Card><Card className="p-6"><p className="text-xs font-bold tracking-widest text-zawana-500">QUICK ACTIONS</p><div className="mt-4 grid gap-2">{[['/book','Book court'],['/membership','Membership'],['/performance','Performance'],['/recovery','Recovery']].map(([to,label])=><Link key={to} to={to} className="flex items-center justify-between rounded-xl bg-zawana-950/5 p-3 text-sm font-bold hover:bg-zawana-950/8">{label}<ArrowRight size={16}/></Link>)}</div></Card></div><div className="mt-6"><Card className="p-6"><div className="flex justify-between"><div><p className="text-xs font-bold tracking-widest text-zawana-500">RECENT ACTIVITY</p><h3 className="mt-2 text-xl font-black">Your Zawana week</h3></div><Link to="/performance" className="text-sm font-bold text-zawana-accent">Performance →</Link></div><div className="mt-6 grid gap-3 md:grid-cols-3">{['Court session completed','Squat PR recorded','Membership renewed'].map((x,i)=><div key={x} className="rounded-xl border border-zawana-950/7 p-4"><p className="text-sm font-bold">{x}</p><p className="mt-1 text-xs text-zawana-500">{i+1} day{i?'s':''} ago</p></div>)}</div></Card></div></Page>}
export function Book(){const [date,setDate]=useState('28 Sep 2026');const [court,setCourt]=useState(courts[2]);const [time,setTime]=useState('6:30 PM — 7:30 PM');const [done,setDone]=useState(false);const {addBooking,addNotification}=useApp();const confirm=()=>{const id=`ZW-${Date.now()}`;addBooking({id,kind:'court',title:court.name,date,time,location:'Indoor Court',status:'confirmed',price:court.price});addNotification({id:`n-${Date.now()}`,title:'Booking confirmed',body:`${court.name} is reserved for ${time}.`,time:'Just now',read:false});setDone(true)};if(done)return <Page title="Booking confirmed" eyebrow="You're in"><Card className="mx-auto max-w-xl p-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-zawana-accent text-zawana-950"><Check/></div><h2 className="mt-5 text-3xl font-black">{court.name}</h2><p className="mt-2 text-zawana-500">{date} · {time}</p><p className="mt-5 text-xs tracking-widest text-zawana-500">BOOKING ID</p><p className="mt-1 font-bold">ZW-{Date.now().toString().slice(-8)}</p><div className="mt-7 flex justify-center gap-2"><Link to="/bookings"><Button>View booking</Button></Link><Link to="/dashboard"><Button variant="secondary">Dashboard</Button></Link></div></Card></Page>;return <Page title="Book a court" eyebrow="Badminton"><div className="grid gap-6 lg:grid-cols-[1fr_360px]"><div className="space-y-6"><Card className="p-6"><h3 className="text-lg font-black">1. Select date</h3><div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-7">{['28 Sep','29 Sep','30 Sep','01 Oct','02 Oct','03 Oct','04 Oct'].map((d,i)=><button key={d} onClick={()=>setDate(d+' 2026')} className={`rounded-xl border p-3 text-left ${date.startsWith(d)?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/8 bg-zawana-950/3'}`}><span className="block text-[10px] text-zawana-500">{['MON','TUE','WED','THU','FRI','SAT','SUN'][i]}</span><b className="mt-2 block text-sm">{d}</b></button>)}</div></Card><Card className="p-6"><h3 className="text-lg font-black">2. Select court</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{courts.map(c=><button disabled={c.status==='maintenance'} key={c.id} onClick={()=>setCourt(c)} className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40 ${court.id===c.id?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/8 bg-zawana-950/3'}`}><div className="flex justify-between"><b>{c.name}</b><Badge>{c.type}</Badge></div><p className="mt-2 text-sm text-zawana-500">{c.features.join(' · ')}</p><p className="mt-3 text-sm font-bold">{c.price.toLocaleString()} MMK / hour</p></button>)}</div></Card><Card className="p-6"><h3 className="text-lg font-black">3. Select time</h3><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{['5:00 PM — 6:00 PM','5:30 PM — 6:30 PM','6:00 PM — 7:00 PM','6:30 PM — 7:30 PM','7:00 PM — 8:00 PM','7:30 PM — 8:30 PM'].map(t=><button key={t} onClick={()=>setTime(t)} className={`rounded-xl border p-3 text-sm font-bold ${time===t?'border-zawana-accent bg-zawana-accent/10':'border-zawana-950/8'}`}>{t}</button>)}</div></Card></div><Card className="h-fit p-6 lg:sticky lg:top-24"><p className="text-xs font-bold tracking-widest text-zawana-accent">SUMMARY</p><h2 className="mt-3 text-2xl font-black">{court.name}</h2><div className="mt-5 space-y-3 border-y border-zawana-950/8 py-5 text-sm"><div className="flex justify-between"><span className="text-zawana-500">Date</span><b>{date}</b></div><div className="flex justify-between"><span className="text-zawana-500">Time</span><b>{time}</b></div><div className="flex justify-between"><span className="text-zawana-500">Court fee</span><b>{court.price.toLocaleString()} MMK</b></div></div><Button onClick={confirm} className="mt-5 w-full">Confirm booking</Button></Card></div></Page>}
export function Bookings(){const {bookings,cancelBooking}=useApp();return <Page title="My bookings" eyebrow="Schedule"><div className="space-y-3">{bookings.map(b=><Card key={b.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2"><h3 className="font-black">{b.title}</h3><Badge good={b.status==='confirmed'}>{b.status}</Badge></div><p className="mt-2 text-sm text-zawana-500">{b.date} · {b.time} · {b.location}</p><p className="mt-1 text-xs text-zawana-500">{b.id}</p></div><div className="flex gap-2"><Button variant="secondary">View</Button>{b.status==='confirmed'&&<Button variant="danger" onClick={()=>cancelBooking(b.id)}>Cancel</Button>}</div></div></Card>)}{!bookings.length&&<Empty title="No upcoming bookings" body="Your next session starts with a court, class or recovery booking." action={<Link to="/book"><Button>Book now</Button></Link>}/>}</div></Page>}
export function Membership(){const [selected,setSelected]=useState('athlete');return <Page title="Membership" eyebrow="Your access"><Card className="mb-6 p-6"><div className="flex flex-col justify-between gap-5 md:flex-row"><div><Badge good>Active</Badge><h2 className="mt-3 text-3xl font-black">Athlete membership</h2><p className="mt-2 text-sm text-zawana-500">24 Sep 2026 → 24 Oct 2026 · 12 sessions remaining</p></div><Button>Renew membership</Button></div></Card><div className="grid gap-4 md:grid-cols-3">{memberships.map(m=><Card key={m.id} className={`p-6 ${selected===m.id?'border-zawana-accent':''}`}><div className="flex justify-between"><h3 className="text-xl font-black">{m.name}</h3>{selected===m.id&&<Badge good>Current</Badge>}</div><p className="mt-5 text-3xl font-black">{m.price.toLocaleString()} <span className="text-sm text-zawana-500">MMK</span></p><ul className="my-6 space-y-3">{m.features.map(f=><li className="flex gap-2 text-sm text-zawana-500" key={f}><Check size={15} className="text-zawana-accent"/>{f}</li>)}</ul><Button onClick={()=>setSelected(m.id)} variant={selected===m.id?'secondary':'primary'} className="w-full">{selected===m.id?'Current plan':'Choose plan'}</Button></Card>)}</div></Page>}
export function Performance(){return <Page title="Athlete performance" eyebrow="Performance lab"><div className="grid gap-4 md:grid-cols-5"><Stat label="Body weight" value="70.0 KG"/><Stat label="Squat" value="120 KG"/><Stat label="Bench" value="80 KG"/><Stat label="Deadlift" value="150 KG"/><Stat label="Vertical" value="52 CM"/></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Card className="p-6"><h3 className="font-black">Squat progression</h3><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={performance}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Line type="monotone" dataKey="value" stroke="#C4AF49" strokeWidth={3} dot={{r:4}}/></LineChart></ResponsiveContainer></div></Card><Card className="p-6"><h3 className="font-black">Training volume</h3><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:'W1',value:12},{name:'W2',value:18},{name:'W3',value:15},{name:'W4',value:22},{name:'W5',value:19},{name:'W6',value:25}]}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Bar dataKey="value" fill="#C4AF49" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Card></div><Card className="mt-6 p-6"><h3 className="font-black">Personal records</h3><div className="mt-4 grid gap-3 md:grid-cols-3">{[['Squat','120 KG'],['Deadlift','150 KG'],['Bench Press','80 KG'],['Vertical Jump','52 CM'],['10M Sprint','1.82 SEC'],['3KM','15:00']].map(([a,b])=><div key={a} className="rounded-xl bg-zawana-950/4 p-4"><p className="text-xs text-zawana-500">{a}</p><p className="mt-1 text-xl font-black">{b}</p></div>)}</div></Card></Page>}
export function Training(){const [done,setDone]=useState<string[]>([]);const workouts=[['MON','Lower Strength','4 exercises'],['TUE','Zone 2','30 min'],['WED','Upper Strength','5 exercises'],['THU','Power','4 exercises'],['FRI','Badminton','90 min']];return <Page title="Training program" eyebrow="Athlete performance"><Card className="p-6"><div className="flex justify-between"><div><p className="text-xs font-bold tracking-widest text-zawana-accent">SAI — PERFORMANCE PROGRAM</p><h2 className="mt-2 text-2xl font-black">Week 01</h2></div><Badge>Active</Badge></div><div className="mt-6 space-y-3">{workouts.map(([day,title,meta])=><div key={day} className="flex items-center justify-between rounded-xl border border-zawana-950/8 p-4"><div className="flex items-center gap-4"><span className="w-10 text-xs font-black text-zawana-500">{day}</span><div><p className="font-bold">{title}</p><p className="text-xs text-zawana-500">{meta}</p></div></div><Button variant={done.includes(day)?'secondary':'primary'} onClick={()=>setDone(x=>x.includes(day)?x.filter(a=>a!==day):[...x,day])}>{done.includes(day)?'Completed':'Complete'}</Button></div>)}</div></Card><Card className="mt-6 p-6"><h3 className="font-black">Today's workout · Back Squat</h3><div className="mt-4 grid gap-3 md:grid-cols-3">{['4 × 5','Target 105 KG','Previous 100 KG'].map(x=><div key={x} className="rounded-xl bg-zawana-950/4 p-4 text-sm font-bold">{x}</div>)}</div></Card></Page>}
export function Recovery(){const services=['Sports Massage','Physiotherapy','Mobility Assessment','Recovery Session','Injury Assessment','Ice Recovery'];return <Page title="Recovery center" eyebrow="Recover deliberately"><div className="grid gap-4 md:grid-cols-3">{services.map((s,i)=><Card key={s} className="p-6"><Badge>{i%2?'Assessment':'Recovery'}</Badge><h3 className="mt-4 text-xl font-black">{s}</h3><p className="mt-2 text-sm text-zawana-500">Professional recovery support for training and performance.</p><p className="mt-5 font-black">{[30000,45000,25000,20000,35000,15000][i].toLocaleString()} MMK</p><Button className="mt-5 w-full">Book service</Button></Card>)}</div></Page>}
export function Classes(){const [booked,setBooked]=useState<string[]>([]);return <Page title="Classes" eyebrow="Train together"><div className="grid gap-4 md:grid-cols-3">{classes.map(c=><Card key={c.id} className="p-6"><div className="flex justify-between"><Badge>{c.level}</Badge><span className="text-sm font-bold">{c.price.toLocaleString()} MMK</span></div><h3 className="mt-4 text-xl font-black">{c.title}</h3><p className="mt-2 text-sm text-zawana-500">{c.coach} · {c.time} · {c.duration} min</p><p className="mt-2 text-sm text-zawana-500">{c.booked}/{c.capacity} spots · {c.location}</p><Button className="mt-5 w-full" disabled={c.booked>=c.capacity} onClick={()=>setBooked(x=>[...x,c.id])}>{booked.includes(c.id)?'Booked':c.booked>=c.capacity?'Join waitlist':'Book class'}</Button></Card>)}</div></Page>}
export function Notifications(){const {notifications}=useApp();return <Page title="Notifications" eyebrow="Stay in the loop"><div className="space-y-3">{notifications.map(n=><Card key={n.id} className={`p-5 ${!n.read?'border-zawana-accent/30':''}`}><div className="flex justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="font-black">{n.title}</h3>{!n.read&&<Badge good>New</Badge>}</div><p className="mt-2 text-sm text-zawana-500">{n.body}</p></div><span className="whitespace-nowrap text-xs text-zawana-500">{n.time}</span></div></Card>)}</div></Page>}
export function Profile(){const {user}=useAuth();const [name,setName]=useState(user?.name||'');return <Page title="Profile" eyebrow="Your Zawana identity"><Card className="max-w-3xl p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-zawana-accent text-xl font-black text-zawana-950">{name.slice(0,2).toUpperCase()}</div><div><h2 className="text-2xl font-black">{name}</h2><p className="text-sm text-zawana-500">{user?.email}</p></div></div><div className="mt-8 grid gap-5 md:grid-cols-2"><label className="text-sm font-bold">Name<input value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none focus:border-zawana-accent"/></label><label className="text-sm font-bold">Phone<input defaultValue="09 000 000 000" className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"/></label><label className="text-sm font-bold">Primary sport<select className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"><option>Badminton</option><option>Fitness</option><option>Athlete Performance</option></select></label><label className="text-sm font-bold">Goal<input defaultValue="Performance" className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"/></label></div><Button className="mt-6">Save profile</Button></Card></Page>}
export function Community(){return <Page title="Zawana community" eyebrow="Move together"><div className="grid gap-4 lg:grid-cols-2">{['Athlete of the Month','September Challenge','Tournament Weekend','Performance Lab Notes'].map((x,i)=><Card key={x} className="overflow-hidden"><div className="h-40 bg-[linear-gradient(135deg,#15191a,#2a302d)]"/><div className="p-6"><p className="text-xs font-bold tracking-widest text-zawana-accent">{i%2?'COMMUNITY':'ZAWANA ATHLETE'}</p><h3 className="mt-2 text-2xl font-black">{x}</h3><p className="mt-2 text-sm text-zawana-500">Stories, challenges and practical education from inside the arena.</p></div></Card>)}</div></Page>}
export function Store(){const {cart,addToCart}=useApp();return <Page title="Zawana store" eyebrow={`${cart.reduce((a,b)=>a+b.quantity,0)} items in cart`} actions={<Button variant="secondary"><ShoppingBag size={16} className="mr-2 inline"/> Cart</Button>}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map(p=><Card key={p.id} className="overflow-hidden"><div className="grid h-48 place-items-center bg-zawana-950/4 text-6xl font-black text-zawana-950/10">Z</div><div className="p-5"><p className="text-xs text-zawana-500">{p.category}</p><h3 className="mt-1 font-black">{p.name}</h3><p className="mt-2 text-sm text-zawana-500">{p.description}</p><div className="mt-5 flex items-center justify-between"><b>{p.price.toLocaleString()} MMK</b><Button onClick={()=>addToCart(p.id)}>Add</Button></div></div></Card>)}</div></Page>}
export function Admin(){return <Page title="Admin overview" eyebrow="Zawana operations"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Stat label="Active members" value="342" sub="+32 this month"/><Stat label="Today's check-ins" value="127"/><Stat label="Monthly revenue" value="48.5M" sub="MMK"/><Stat label="Court occupancy" value="78%"/><Stat label="New members" value="32"/><Stat label="Expiring" value="12"/></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Card className="p-6"><h3 className="font-black">Revenue · MMK millions</h3><div className="mt-5 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={revenue}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Line type="monotone" dataKey="value" stroke="#C4AF49" strokeWidth={3}/></LineChart></ResponsiveContainer></div></Card><Card className="p-6"><h3 className="font-black">Peak hours</h3><div className="mt-5 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:'8AM',value:42},{name:'10AM',value:55},{name:'12PM',value:38},{name:'4PM',value:71},{name:'6PM',value:94},{name:'8PM',value:86}]}><CartesianGrid stroke="rgba(29,27,71,.08)"/><XAxis dataKey="name" stroke="#7d8886"/><YAxis stroke="#7d8886"/><Tooltip contentStyle={{background:'#FFFFFF',border:'1px solid rgba(29,27,71,.1)',borderRadius:12}}/><Bar dataKey="value" fill="#C4AF49" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Card></div></Page>}
export function AdminTable({title,items}:{title:string;items:string[]}){return <Page title={title} eyebrow="Administration"><Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-zawana-950/8 p-5"><div className="flex items-center gap-2 rounded-xl border border-zawana-950/8 bg-zawana-950/3 px-3 py-2"><Search size={16} className="text-zawana-500"/><input placeholder="Search..." className="bg-transparent text-sm outline-none"/></div><Button>Add new</Button></div><div className="divide-y divide-zawana-950/8">{items.map((x,i)=><div key={x} className="grid gap-3 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"><div><b>{x}</b><p className="mt-1 text-xs text-zawana-500">ZW-{String(1200+i)}</p></div><span className="text-sm text-zawana-500">{i%2?'Active':'Premium'}</span><span className="text-sm text-zawana-500">28 Sep 2026</span><Button variant="secondary">View</Button></div>)}</div></Card></Page>}
export function Login(){const {login}=useAuth();const nav=useNavigate();const [email,setEmail]=useState('member@zawana.test');const [password,setPassword]=useState('password123');const [error,setError]=useState('');const submit=async(e:FormEvent)=>{e.preventDefault();setError('');const ok=await login(email,password);if(!ok){setError('Use a valid demo account and password123.');return}nav(email.includes('admin')?'/admin':email.includes('coach')?'/coach':'/dashboard')};return <AuthShell title="Welcome back."><form onSubmit={submit} className="space-y-4"><Field label="Email"><input required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Password"><input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>{error&&<p className="text-sm text-red-300">{error}</p>}<Button className="w-full">Login</Button><Button type="button" variant="secondary" className="w-full">Continue with Google</Button><p className="text-center text-sm text-zawana-500">Don't have an account? <Link className="font-bold text-zawana-950" to="/signup">Create one</Link></p><div className="rounded-xl bg-zawana-950/4 p-4 text-xs text-zawana-500">Demo: member@zawana.test · coach@zawana.test · admin@zawana.test<br/>Password: password123</div></form></AuthShell>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="block text-sm font-bold">{label}<div className="mt-2">{children}</div></label>}
function AuthShell({title,children}:{title:string;children:ReactNode}){
  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
    <div className="relative hidden overflow-hidden bg-zawana-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-zawana-gold/35"/>
      <div className="absolute -right-2 top-24 h-36 w-36 rounded-full border border-zawana-gold/25"/>
      <Logo/>
      <div className="relative max-w-xl">
        <p className="eyebrow text-zawana-gold">Badminton & sports arena</p>
        <h1 className="mt-6 text-7xl font-black leading-[.87] tracking-[-.07em]">PLAY.<br/>TRAIN.<br/><span className="text-zawana-gold">PERFORM.</span></h1>
        <p className="mt-8 max-w-lg text-base leading-7 text-white/65">A premium training environment for players, athletes and people who love to move.</p>
      </div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-white/45">Yangon · Est. 2022</p>
    </div>
    <div className="flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <div className="mb-8 lg:hidden"><Logo/></div>
        <p className="eyebrow text-zawana-gold">The Zawana</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-.05em]">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  </div>
}
export function Signup(){const {signup}=useAuth();const nav=useNavigate();const [step,setStep]=useState(1);const [name,setName]=useState('');const [email,setEmail]=useState('');return <AuthShell title={step<4?'Create your Zawana account.':'Welcome to Zawana.'}><div className="mb-6 flex gap-1">{[1,2,3,4].map(i=><div key={i} className={`h-1 flex-1 rounded-full ${i<=step?'bg-zawana-accent':'bg-zawana-950/10'}`}/>)}</div>{step===1&&<div className="space-y-4"><Field label="Full name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Sai Zay"/></Field><Field label="Email"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></Field><Button className="w-full" disabled={!name||!email} onClick={()=>setStep(2)}>Continue</Button></div>}{step===2&&<div className="space-y-3">{['Badminton','Fitness','Strength & Conditioning','Athlete Performance','Personal Training','Recovery'].map(x=><button key={x} onClick={()=>setStep(3)} className="w-full rounded-xl border border-zawana-950/8 p-4 text-left font-bold hover:border-zawana-accent">{x}</button>)}</div>}{step===3&&<div className="space-y-3">{['Improve fitness','Build strength','Improve badminton','Athlete performance','General health'].map(x=><button key={x} onClick={()=>setStep(4)} className="w-full rounded-xl border border-zawana-950/8 p-4 text-left font-bold hover:border-zawana-accent">{x}</button>)}</div>}{step===4&&<div className="space-y-4"><Field label="Create password"><input type="password" defaultValue="password123"/></Field><Button className="w-full" onClick={async()=>{await signup(name,email,'password123');nav('/dashboard')}}>Finish signup</Button></div>}</AuthShell>}
export function Generic({title,body}:{title:string;body:string}){return <Page title={title} eyebrow="Zawana"><Card className="p-8"><p className="max-w-2xl text-zawana-500">{body}</p></Card></Page>}
