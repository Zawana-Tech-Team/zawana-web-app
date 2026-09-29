import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { Field, AuthShell } from '../components/AuthShell';

const demoRoutes: Record<string, string> = {
  'member@zawana.test': '/dashboard',
  'coach@zawana.test': '/coach',
  'admin@zawana.test': '/admin',
  'gymfo@zawana.test': '/front-office/gym',
  'clinicfo@zawana.test': '/front-office/revive-clinic',
};

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('member@zawana.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    const ok = await login(normalizedEmail, password);

    if (!ok) {
      setError('Use a valid demo account and password123.');
      return;
    }

    nav(demoRoutes[normalizedEmail] ?? '/dashboard', { replace: true });
  };

  return (
    <AuthShell title="Welcome back.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password">
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <Button className="w-full">Login</Button>
        <Button type="button" variant="secondary" className="w-full">
          Continue with Google
        </Button>

        <p className="text-center text-sm text-zawana-500">
          Don't have an account?{' '}
          <Link className="font-bold text-zawana-950" to="/signup">
            Create one
          </Link>
        </p>

        <div className="rounded-xl bg-zawana-950/4 p-4 text-xs leading-6 text-zawana-500">
          <b className="text-zawana-950">Demo accounts</b><br />
          Member · member@zawana.test<br />
          Coach · coach@zawana.test<br />
          Admin · admin@zawana.test<br />
          Gym Front Office · gymfo@zawana.test<br />
          Revive Clinic FO · clinicfo@zawana.test<br />
          Password · password123
        </div>
      </form>
    </AuthShell>
  );
}
