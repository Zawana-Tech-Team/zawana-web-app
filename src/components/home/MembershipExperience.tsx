import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { LocalizedTree, useLanguage } from '../../context/LanguageContext';
import { FadeUp, MagneticButton, RevealLines } from './Motion';
import { SectionLabel } from './LandingSections';

type Package = {
  id: string;
  title: string;
  price: number;
  sessions: number;
  validity: number;
  description: string;
  status: string;
};
const pathways = [
  {
    id: 'court',
    title: 'On the court',
    label: 'BADMINTON',
    description: 'Explore session packages and make more room for your game.',
    destination: '/membership',
    action: 'View badminton packages'
  },
  {
    id: 'gym',
    title: 'In your element',
    label: 'GYM & PERFORMANCE',
    description: 'Discover gym access and training options with the ZAWANA team.',
    destination: '/contact',
    action: 'Ask about gym memberships'
  }
];

export function MembershipExperience() {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const [selected, setSelected] = useState('court');
  const [state, setState] = useState<{ packages: Package[]; loading: boolean; error: boolean }>({
    packages: [],
    loading: false,
    error: false
  });
  useEffect(() => {
    if (user?.role !== 'member') {
      setState({ packages: [], loading: false, error: false });
      return;
    }
    const controller = new AbortController();
    setState({ packages: [], loading: true, error: false });
    api<Package[]>('/packages/badminton', { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted)
          setState({
            packages: items.filter((item) => item.status === 'active'),
            loading: false,
            error: false
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ packages: [], loading: false, error: true });
      });
    return () => controller.abort();
  }, [user?.id, user?.role]);
  return (
    <LocalizedTree>
      <section
        id="membership"
        tabIndex={-1}
        className="membership-experience public-section"
        aria-labelledby="membership-heading"
      >
        <div className="public-container">
          <SectionLabel number="06">The membership experience</SectionLabel>
          <div className="public-section-heading">
            <h2 id="membership-heading" className="public-heading">
              <RevealLines lines={['YOUR GAME.', 'YOUR WAY.']} />
            </h2>
            <FadeUp>
              <p>
                A little more commitment.
                <br />A world of possibility.
              </p>
              <span className="public-small">FIND YOUR PLACE AT ZAWANA</span>
            </FadeUp>
          </div>
          <div className="membership-comparison">
            <fieldset className="membership-options">
              <legend className="public-small">Choose your focus</legend>
              {pathways.map((path) => (
                <label key={path.id} className={selected === path.id ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="membership-focus"
                    value={path.id}
                    checked={selected === path.id}
                    onChange={() => setSelected(path.id)}
                  />
                  <span className="membership-option">
                    <span className="public-small">{path.label}</span>
                    <strong>{path.title}</strong>
                    <span>{path.description}</span>
                    <span className="membership-selector" aria-hidden="true">
                      {selected === path.id ? <Check size={18} /> : <ArrowUpRight size={18} />}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="membership-detail" aria-live="polite">
              <span className="public-small">A MEMBERSHIP THAT MOVES WITH YOU</span>
              <h3>
                {selected === 'court' ? 'More time for\nyour game.' : 'Make progress\na practice.'}
              </h3>
              <p>
                {selected === 'court'
                  ? 'View current badminton packages, session allowances, and validity in your member account.'
                  : 'Speak with the team about current gym memberships and the right training path for you.'}
              </p>
              {selected === 'court' && user?.role === 'member' && (
                <div className="membership-live">
                  {state.loading ? (
                    <p role="status">Loading current packages…</p>
                  ) : state.error ? (
                    <p role="status">
                      Current packages are temporarily unavailable. Open your member account to try
                      again.
                    </p>
                  ) : state.packages.length ? (
                    <ul>
                      {state.packages.slice(0, 3).map((item) => (
                        <li key={item.id}>
                          <strong>{item.title}</strong>
                          <span>
                            {item.price.toLocaleString(locale)} MMK · {item.sessions} sessions ·{' '}
                            {item.validity} days
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>See your account for current package options.</p>
                  )}
                </div>
              )}
              <MagneticButton to={pathways.find((path) => path.id === selected)!.destination}>
                {pathways.find((path) => path.id === selected)!.action}
              </MagneticButton>
              <p className="membership-disclosure">
                {selected === 'court'
                  ? 'Sign in to see current prices and complete your purchase.'
                  : 'Membership details and prices are confirmed by the ZAWANA team.'}
              </p>
              <Link to="/signup" className="public-text-link">
                New here? Join ZAWANA <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </LocalizedTree>
  );
}
