import { Link } from 'react-router-dom';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { Card, Logo, Page } from '../components/UI';
import OptimizedImage from '../components/OptimizedImage';
import { LanguageSwitcher, LocalizedTree } from '../context/LanguageContext';

const facilities = [
  {
    name: 'Badminton Courts',
    image: 'court',
    to: '/book/court',
    action: 'Book a court',
    body: 'Social games, junior classes, and competitive training. Space for every level of play.'
  },
  {
    name: 'High Performance Gym',
    image: 'gym',
    to: '/training',
    action: 'Explore training',
    body: 'Strength, conditioning, and training designed to move your performance forward.'
  },
  {
    name: 'Training Studio',
    image: 'gx-studio',
    to: '/classes',
    action: 'Explore classes',
    body: 'Yoga, Zumba, kickboxing, Taekwondo, and more ways to find your rhythm.'
  },
  {
    name: 'Revive Clinic',
    image: 'revive',
    to: '/revive',
    action: 'Discover Revive',
    body: 'Care, recovery, and treatment to help you get moving again.'
  },
  {
    name: 'Zawana Cafe',
    image: 'cafe',
    to: '/cafe-order',
    action: 'Explore the cafe',
    body: 'Refuel, recharge, and connect between sessions.'
  },
  {
    name: 'Cut Lab',
    image: 'cutlab',
    to: '/contact',
    action: 'Ask about Cut Lab',
    body: 'Professional barbering, styling, and grooming in the arena.'
  }
];

export function Generic({ title, body }: { title: string; body: string }) {
  return (
    <LocalizedTree>
      <div className="zawana-info zawana-workspace">
        <header className="info-header">
          <Link to="/" aria-label="ZAWANA home">
            <Logo />
          </Link>
          <nav aria-label="Public navigation">
            <Link to="/facilities">Experiences</Link>
            <Link to="/memberships">Membership</Link>
            <Link to="/achievements">Achievements</Link>
            <Link to="/coaches">Coaches</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <Link className="info-join" to="/signup">
            Join ZAWANA
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </header>
        <Page
          title={title === 'Contact Zawana' ? 'Make your next move.' : title}
          eyebrow="THE ZAWANA / YANGON"
          actions={<LanguageSwitcher />}
        >
          <p className="mb-8 max-w-2xl text-sm leading-7 text-zawana-600">{body}</p>
          {title === 'Facilities' ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {facilities.map((f) => (
                <Link key={f.name} to={f.to} className="booking-option">
                  <Card className="h-full overflow-hidden">
                    <div className="booking-option__image">
                      <OptimizedImage
                        src={`/facilities/responsive/${f.image}-1280.webp`}
                        srcSet={`/facilities/responsive/${f.image}-640.webp 640w, /facilities/responsive/${f.image}-1280.webp 1280w`}
                        sizes="(min-width:1024px) 33vw, (min-width:768px) 50vw, 100vw"
                        alt={f.name}
                        width={1280}
                        height={960}
                      />
                    </div>
                    <div className="p-6">
                      <h2 className="text-2xl">{f.name}</h2>
                      <p className="mt-3 text-sm leading-7 text-zawana-600">{f.body}</p>
                      <span className="booking-option__action">
                        {f.action}
                        <ArrowUpRight size={18} aria-hidden="true" />
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : title === 'Contact Zawana' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="info-contact p-6 sm:p-8">
                <MapPin size={24} />
                <h2>Come find your element.</h2>
                <address>
                  No. 31, corner of Zawana & Thiri Ayeyar Street,
                  <br />
                  Thingangyun, Yangon, Myanmar
                </address>
                <a href="tel:+959447974995">
                  <Phone size={16} aria-hidden="true" />
                  +95 9 447 974 995
                </a>
                <a href="mailto:zawana4994@gmail.com">
                  <Mail size={16} aria-hidden="true" />
                  zawana4994@gmail.com
                </a>
                <a
                  href="https://www.facebook.com/103013559107437"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Follow on Facebook
                  <ArrowUpRight size={16} aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <Link to="/book/court" className="info-join">
                  Book a court
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </Card>
              <div className="info-contact-photo">
                <OptimizedImage
                  src="/facilities/responsive/court-1280.webp"
                  alt="ZAWANA badminton arena"
                  width={1280}
                  height={960}
                />
              </div>
            </div>
          ) : title === 'Memberships' || title === 'Coaches' ? (
            <div className="grid gap-6 md:grid-cols-2">
              {(title === 'Memberships'
                ? [
                    {
                      name: 'More time for your game.',
                      image: 'court',
                      to: '/membership',
                      action: 'View badminton packages',
                      body: 'Sign in to see current packages, session allowances, prices, and validity. Complete your purchase through your member account.'
                    },
                    {
                      name: 'Make progress a practice.',
                      image: 'gym',
                      to: '/contact',
                      action: 'Ask about gym memberships',
                      body: 'Speak with the team about current gym memberships and the right training path for you.'
                    }
                  ]
                : [
                    {
                      name: 'Every rally. A new level.',
                      image: 'court',
                      to: '/private-course',
                      action: 'Explore badminton coaching',
                      body: 'Find available private courses and coaching through your member account.'
                    },
                    {
                      name: 'Train with intention.',
                      image: 'gym',
                      to: '/book/coach',
                      action: 'Find a training session',
                      body: 'Connect with a ZAWANA coach for a personal training session that fits your schedule.'
                    }
                  ]
              ).map((f) => (
                <Link key={f.name} to={f.to} className="booking-option">
                  <Card className="h-full overflow-hidden">
                    <div className="booking-option__image">
                      <OptimizedImage
                        src={`/facilities/responsive/${f.image}-1280.webp`}
                        alt={
                          f.image === 'court' ? 'ZAWANA badminton courts' : 'ZAWANA performance gym'
                        }
                        sizes="50vw"
                        width={1280}
                        height={960}
                      />
                    </div>
                    <div className="p-6 sm:p-8">
                      <h2>{f.name}</h2>
                      <p className="mt-3 text-sm leading-7 text-zawana-600">{f.body}</p>
                      <span className="booking-option__action">
                        {f.action}
                        <ArrowUpRight size={18} aria-hidden="true" />
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-8">
              <p>{body}</p>
            </Card>
          )}
        </Page>
        <footer className="info-footer">
          <span>© {new Date().getFullYear()} THE ZAWANA</span>
          <Link to="/login">
            Member login
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </LocalizedTree>
  );
}
