import { Link } from 'react-router-dom';
import { ArrowUpRight, Dumbbell, Trophy } from 'lucide-react';
import { Badge, Card, Page } from '../components/UI';
import OptimizedImage from '../components/OptimizedImage';

const options = [
  {
    to: '/book/court',
    image: 'court',
    icon: Trophy,
    category: '01 / BADMINTON',
    title: 'Make time for your game.',
    body: 'Reserve a court for your next session. Choose your date, court, and an available time.',
    tags: ['Indoor courts', 'Hourly booking'],
    action: 'Book a badminton court'
  },
  {
    to: '/book/coach',
    image: 'gym',
    icon: Dumbbell,
    category: '02 / COACHING',
    title: 'Train with intention.',
    body: 'Book a personal session with a ZAWANA coach based on your goals and preferred schedule.',
    tags: ['Personal training', 'Coach selection'],
    action: 'Book with a coach'
  }
];

export function Book() {
  return (
    <Page title="Your next session starts here." eyebrow="Book at ZAWANA">
      <p className="mb-8 max-w-xl text-sm leading-7 text-zawana-600">
        Choose your court time or connect with a coach. Make the next session yours.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {options.map(({ icon: Icon, ...option }) => (
          <Link key={option.to} to={option.to} className="booking-option group">
            <Card className="h-full overflow-hidden">
              <div className="booking-option__image">
                <OptimizedImage
                  src={`/facilities/responsive/${option.image}-1280.webp`}
                  srcSet={`/facilities/responsive/${option.image}-640.webp 640w, /facilities/responsive/${option.image}-1280.webp 1280w`}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  alt={
                    option.image === 'court'
                      ? 'ZAWANA badminton courts'
                      : 'The ZAWANA high performance gym'
                  }
                  width={1280}
                  height={960}
                />
                <span>
                  <Icon size={21} aria-hidden="true" />
                </span>
              </div>
              <div className="p-6 sm:p-8">
                <p className="booking-option__category">{option.category}</p>
                <h2>{option.title}</h2>
                <p className="mt-3 text-sm leading-7 text-zawana-600">{option.body}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {option.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                <span className="booking-option__action">
                  {option.action}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  );
}
