import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ImagePlus, RotateCcw, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Page } from '../components/UI';
import { useAuth } from '../context/AuthContext';

export function Profile() {
  const { user, updateProfile, updateAvatar } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { setName(user?.name || ''); setPhone(user?.phone || ''); }, [user]);

  const discard = () => { setName(user?.name || ''); setPhone(user?.phone || ''); setImage(''); setError(''); setNotice(''); if (input.current) input.current.value = ''; };
  const upload = (file?: File) => {
    if (!file) return;
    setError(''); setNotice('');
    if (file.size > 5 * 1024 * 1024) { setError('Profile photos must be 5 MB or smaller.'); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result || ''));
    reader.onerror = () => setError('Could not read that image.');
    reader.readAsDataURL(file);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) { setError('Enter a name with at least two characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (image) await updateAvatar(image);
      await updateProfile({ name: name.trim(), phone: phone.trim() || null });
      setImage(''); if (input.current) input.current.value = '';
      setNotice('Your profile was saved.');
    } catch (e: any) { setError(e.message || 'Could not save your profile.'); }
    finally { setBusy(false); }
  };
  const changed = name !== (user?.name || '') || phone !== (user?.phone || '') || Boolean(image);

  return <Page title="Profile" eyebrow="Your Zawana identity">
    <div className="max-w-3xl">
      <form onSubmit={save}>
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-5 border-b p-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-3xl bg-zawana-950/5">
                {image || user?.avatar ? <img src={image || user?.avatar} alt="Profile" className="h-full w-full object-cover" /> : <UserRound size={32} className="text-zawana-400" />}
              </div>
              <div className="sm:hidden"><p className="font-black">{user?.name}</p><Badge>{user?.role?.replaceAll('_', ' ')}</Badge></div>
            </div>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Zawana account</p>
              <h2 className="mt-1 text-2xl font-black">{user?.name}</h2>
              <p className="mt-1 text-sm text-zawana-500">{user?.email}</p>
              <div className="mt-3 hidden sm:block"><Badge>{user?.role?.replaceAll('_', ' ')}</Badge></div>
              <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0])} />
              <Button type="button" variant="secondary" className="mt-3" onClick={() => input.current?.click()}><ImagePlus size={16} />Choose profile photo</Button>
              <p className="mt-1 text-xs text-zawana-500">PNG, JPG, or WebP · up to 5 MB</p>
            </div>
          </div>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <label className="text-sm font-bold">Full name<input required minLength={2} maxLength={100} className="mt-2 w-full" value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="text-sm font-bold">Phone number<input type="tel" maxLength={40} className="mt-2 w-full" placeholder="+95…" value={phone} onChange={e => setPhone(e.target.value)} /></label>
            <label className="text-sm font-bold sm:col-span-2">Email address<input readOnly className="mt-2 w-full opacity-70" value={user?.email || ''} /><span className="mt-1 block text-xs font-normal text-zawana-500">Email changes are managed by your verified sign-in provider.</span></label>
          </div>
          <div className="border-t p-6">
            {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={16} />{notice}</p>}
            <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving profile…' : 'Save profile'}</Button>{changed && <Button type="button" variant="secondary" disabled={busy} onClick={discard}><RotateCcw size={15} />Discard changes</Button>}<Link className="ml-auto text-sm font-bold text-zawana-500" to="/settings">Security & settings</Link></div>
          </div>
        </Card>
      </form>
    </div>
  </Page>;
}
