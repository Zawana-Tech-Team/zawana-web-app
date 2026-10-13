import { Link } from 'react-router-dom';
import { ArrowRight, Badge, Dumbbell, Trophy,
} from 'lucide-react';
import { Card, Page } from '../components/UI';

export function Book() {
  return (
    <Page title="Book a Session" eyebrow="Zawana">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h2 className="text-2xl font-black">
            What would you like to book?
          </h2>

          <p className="mt-2 text-sm text-zawana-500">
            Choose a badminton court or book a personal session
            with one of our coaches.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* BADMINTON COURT */}
          <Link to="/book/court" className="group">
            <Card className="h-full p-7 transition-all duration-200 group-hover:-translate-y-1 group-hover:border-zawana-accent">
              <div className="flex items-start justify-between">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-zawana-accent/10">
                  <Trophy className="h-7 w-7 text-zawana-accent" />
                </div>

                <ArrowRight className="h-5 w-5 text-zawana-400 transition-transform group-hover:translate-x-1" />
              </div>

              <h3 className="mt-7 text-2xl font-black">
                Book a Badminton Court
              </h3>

              <p className="mt-3 text-sm leading-6 text-zawana-500">
                Reserve a court for your next badminton session.
                Choose your preferred date, court and available time.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Badge>Indoor Courts</Badge>
                <Badge>Hourly Booking</Badge>
              </div>

              <div className="mt-7 text-sm font-bold">
                Continue →
              </div>
            </Card>
          </Link>

          {/* COACH */}
          <Link to="/book/coach" className="group">
            <Card className="h-full p-7 transition-all duration-200 group-hover:-translate-y-1 group-hover:border-zawana-accent">
              <div className="flex items-start justify-between">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-zawana-accent/10">
                  <Dumbbell className="h-7 w-7 text-zawana-accent" />
                </div>

                <ArrowRight className="h-5 w-5 text-zawana-400 transition-transform group-hover:translate-x-1" />
              </div>

              <h3 className="mt-7 text-2xl font-black">
                Book with a Coach
              </h3>

              <p className="mt-3 text-sm leading-6 text-zawana-500">
                Book a personal training session with a Zawana
                coach based on your goals and preferred schedule.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Badge>Personal Training</Badge>
                <Badge>Coach Selection</Badge>
              </div>

              <div className="mt-7 text-sm font-bold">
                Continue →
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </Page>
  );
}
