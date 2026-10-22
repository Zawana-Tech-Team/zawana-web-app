import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Camera,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Page } from "../components/UI";
import { useAuth } from "../context/AuthContext";

export function Profile() {
  const { user, updateProfile, updateAvatar } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }, [user?.id, user?.name, user?.phone]);

  const discard = () => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setImage("");
    setError("");
    setNotice("");
    if (input.current) input.current.value = "";
  };
  const upload = (file?: File) => {
    if (!file) return;
    setError("");
    setNotice("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photos must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result || ""));
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter a name with at least two characters.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (image) await updateAvatar(image);
      await updateProfile({ name: name.trim(), phone: phone.trim() || null });
      setImage("");
      if (input.current) input.current.value = "";
      setNotice("Your profile was saved.");
    } catch (e: any) {
      setError(e.message || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };
  const changed =
    name !== (user?.name || "") ||
    phone !== (user?.phone || "") ||
    Boolean(image);

  const initials = (user?.name || "Z")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const role =
    user?.role === "member"
      ? "Zawana member"
      : user?.role?.replaceAll("_", " ") || "Zawana account";

  return (
    <Page title="Profile" eyebrow="Your account">
      <p className="mb-7 max-w-xl text-sm leading-relaxed text-zawana-500">
        A little about you. Keep your details up to date for your next visit.
      </p>
      <form
        onSubmit={save}
        className="grid max-w-5xl items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"
      >
        <Card className="overflow-hidden p-0">
          <div className="h-20 border-b border-zawana-gold/15 bg-zawana-gold/10" />
          <div className="px-6 pb-6 text-center">
            <div className="relative mx-auto -mt-12 w-fit">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-zawana-950 text-2xl font-semibold tracking-tight text-white shadow-sm">
                {image || user?.avatar ? (
                  <img
                    src={image || user?.avatar}
                    alt="Your profile photo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-label="Profile initials">{initials}</span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                aria-label="Change profile photo"
                className="absolute -bottom-0.5 -right-0.5 grid h-9 w-9 place-items-center rounded-full border border-zawana-border bg-white text-zawana-950 shadow-sm transition hover:bg-zawana-900 focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-50"
              >
                <Camera size={15} />
              </button>
            </div>
            <h2 className="mt-4 break-words text-xl font-semibold tracking-tight">
              {user?.name}
            </h2>
            <p className="mt-1 break-all text-xs leading-relaxed text-zawana-500">
              {user?.email}
            </p>
            <span className="mt-4 inline-block rounded-full bg-zawana-950/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zawana-500">
              {role}
            </span>
            <input
              ref={input}
              className="sr-only"
              aria-label="Upload profile photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <div className="mt-6 border-t border-zawana-border pt-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="min-h-10 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-50"
              >
                {image ? "Choose another photo" : "Change photo"}
              </button>
              <p className="mt-1 text-[11px] leading-relaxed text-zawana-500">
                JPG, PNG or WebP · Up to 5 MB
              </p>
              {image && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setImage("");
                    if (input.current) input.current.value = "";
                  }}
                  className="mt-2 min-h-9 text-xs font-medium text-zawana-500 underline underline-offset-4"
                >
                  Undo photo change
                </button>
              )}
            </div>
          </div>
        </Card>
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="flex items-start gap-3 border-b border-zawana-border p-5 sm:p-6">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zawana-950/5 text-zawana-500">
                <UserRound size={17} />
              </span>
              <div>
                <h2 className="text-base font-semibold">Personal details</h2>
                <p className="mt-1 text-xs leading-relaxed text-zawana-500">
                  How we know you and keep in touch.
                </p>
              </div>
            </div>
            <div className="space-y-6 p-5 sm:p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-xs font-medium text-zawana-500">
                  Full name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    disabled={busy}
                    className="mt-2 w-full rounded-xl border p-3 text-sm text-zawana-950"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNotice("");
                    }}
                  />
                </label>
                <label className="text-xs font-medium text-zawana-500">
                  Phone number
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={30}
                    disabled={busy}
                    className="mt-2 w-full rounded-xl border p-3 text-sm text-zawana-950"
                    placeholder="+95…"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setNotice("");
                    }}
                  />
                </label>
              </div>
              <div className="border-t border-zawana-border pt-5">
                <label className="text-xs font-medium text-zawana-500">
                  Email address
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-zawana-border bg-zawana-950/[.025] px-3">
                    <Mail size={15} className="shrink-0" aria-hidden="true" />
                    <input
                      readOnly
                      autoComplete="email"
                      className="min-w-0 flex-1 !border-0 !bg-transparent !px-0 !py-3 text-sm text-zawana-500 !shadow-none !ring-0"
                      value={user?.email || ""}
                    />
                    <LockKeyhole
                      size={13}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                </label>
                <p className="mt-2 text-[11px] leading-relaxed text-zawana-500">
                  Email changes are managed by your sign-in provider.
                </p>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                  <Check size={16} className="shrink-0" />
                  {notice}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zawana-border bg-zawana-950/[.015] p-5 sm:px-6">
              <span
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-zawana-500"
              >
                {changed ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-zawana-gold" />
                    Unsaved changes
                  </>
                ) : (
                  "Your details are up to date"
                )}
              </span>
              <div className="flex items-center gap-2">
                {changed && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={discard}
                  >
                    Discard
                  </Button>
                )}
                <Button
                  type="submit"
                  loading={busy}
                  disabled={!changed || name.trim().length < 2}
                >
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </Card>
          <Link
            to="/settings"
            className="group flex min-h-24 items-center gap-4 rounded-2xl border border-zawana-border bg-white p-5 transition hover:border-zawana-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold sm:p-6"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zawana-950/5 text-zawana-500">
              <ShieldCheck size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                Security & settings
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-zawana-500">
                Manage how you sign in and protect your account.
              </span>
            </span>
            <ArrowUpRight
              size={17}
              className="shrink-0 text-zawana-500 transition group-hover:text-zawana-950"
            />
          </Link>
        </div>
      </form>
    </Page>
  );
}
