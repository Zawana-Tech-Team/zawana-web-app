import '../components/member-premium.css';
import { useDialog } from '../components/Interactions';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { motionTokens } from '../design/motion';
import { Select } from '../components/Select';
import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Plus, Search, ShieldCheck, UserRound, X, Trash2 } from "lucide-react";
import { Badge, Button, Card, Empty, Page, Pagination, Toast } from "../components/UI";
import { get, patch, post, del } from "../api";
import { ImageUpload } from "../components/ImageUpload";

type Account = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  membership?: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  coachId?: string | null;
  coachProfile?: { id: string; department: string; imageUrl?: string | null } | null;
  _count?: Record<string, number>
};
type AccountPage = {
  data: Account[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: { members: number; staff: number; active: number }
};
const roles = [
  "member",
  "coach",
  "doctor",
  "admin",
  "owner",
  "gym_fo",
  "clinic_fo",
  "badminton_fo",
  "store_fo",
  "cafe_fo"
];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, x => x.toUpperCase());
const stamp = (value?: string | null) =>value ? new Date(value).toLocaleString() : "Never";

function UserModal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode
}) {
  const dialogRef = useDialog(onClose);
  const reduced = useReducedMotion();
  return <motion.div
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? 0 : motionTokens.dialog }}
    className="premium-dialog-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-zawana-950/60 p-0 sm:items-center sm:p-4"
    onMouseDown={e => {
      if (e.target === e.currentTarget) onClose()
    }}
  >
    <motion.div
      ref={dialogRef} tabIndex={-1} aria-label={title}
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
      transition={{ duration: reduced ? 0 : motionTokens.dialog, ease: motionTokens.ease }}
      role="dialog"
      aria-modal="true"
      className="premium-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-7"
    >
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="eyebrow text-zawana-accent">CENTRAL ACCOUNTS</p>
          <h2 className="mt-1 text-2xl font-black">{title}</h2>
        </div>
        <button aria-label="Close" onClick={onClose} className="rounded-full border p-2">
          <X size={18} />
        </button>
      </div>
      {children}
    </motion.div>
  </motion.div>
}

export default function UserManagement() {
  const [users, setUsers] = useState<Account[]>([]),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1),
    [pageInfo, setPageInfo] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 }),
    [summary, setSummary] = useState({ members: 0, staff: 0, active: 0 });
  const [mode, setMode] = useState<"create" | "edit" | "view" | null>(null),
    [selected, setSelected] = useState<Account | null>(null),
    [activity, setActivity] = useState<any>(null),
    [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null),
    [confirmationName, setConfirmationName] = useState(""),
    [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState<any>({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "member",
    coachDepartment: "Badminton"
  });
  const [coachImage, setCoachImage] = useState<string | null>(null);
  const [coachImageDirty, setCoachImageDirty] = useState(false);
  const load = useCallback(async () => {
    const result = await get<AccountPage>(
      `/users?page=${page}&limit=20&role=${encodeURIComponent(filter)}&search=${encodeURIComponent(query)}`
    );
    setUsers(result.data);
    setPageInfo(result.pagination);
    setSummary(result.summary)
  }, [page, filter, query]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((e: any) => {
        if (active) setError(e.message || "Could not load users.")
      })
      .finally(() => {
        if (active) setLoading(false)
      });
    return () => {
      active = false
    }
  }, [load]);
  const openCreate = () => {
    setError("");
    setPasswordOpen(true);
    setCoachImage(null);
    setCoachImageDirty(false);
    setSelected(null);
    setForm({
      name: "",
      email: "",
      password: "",
      phone: "",
      role: "member",
      coachDepartment: "Badminton"
    });
    setMode("create")
  };
  const openEdit = (u: Account) => {
    setError("");
    setPasswordOpen(false);
    setCoachImage(u.coachProfile?.imageUrl || null);
    setCoachImageDirty(false);
    setSelected(u);
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      role: u.role,
      active: u.active,
      password: "",
      coachDepartment: u.coachProfile?.department || "Badminton"
    });
    setMode("edit")
  };
  const openView = async (u: Account) => {
    setSelected(u);
    setActivity(null);
    setMode("view");
    try {
      setActivity(await get(`/users/${u.id}/activity`))
    } catch (e: any) {
      setError(e.message || "Could not load user activity.")
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        const created = await post<Account>("/users", form);
        let imageFailed = false;
        if (form.role === "coach" && coachImage && created.coachId) {
          try {
            await patch(`/coaches/${created.coachId}`, { imageUrl: coachImage })
          } catch {
            imageFailed = true
          }
        }
        await load();
        setMode(null);
        setNotice(
          imageFailed
            ? "Coach account created, but its profile image could not be saved."
            : "Account created successfully."
        )
      } else if (selected) {
        const { email, ...changes } = form;
        if (!changes.password) delete changes.password;
        await patch(`/users/${selected.id}`, changes);
        if (form.role === "coach" && coachImageDirty && selected.coachProfile?.id)
          await patch(`/coaches/${selected.coachProfile.id}`, { imageUrl: coachImage });
        await load();
        setMode(null);
        setNotice("Account updated successfully.")
      }
    } catch (e: any) {
      setError(e.message || "Could not save account.")
    } finally {
      setBusy(false)
    }
  };
  const toggle = async (u: Account) => {
    setBusy(true);
    try {
      await patch(`/users/${u.id}`, { active: !u.active });
      await load();
      setNotice(`${u.name} ${u.active ? "deactivated" : "activated"}.`)
    } catch (e: any) {
      setError(e.message || "Could not update account.")
    } finally {
      setBusy(false)
    }
  };
  const remove = (u: Account) => {
    setDeleteTarget(u);
    setConfirmationName("");
    setDeleteError("");
    setError("")
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (confirmationName !== deleteTarget.name) {
      setDeleteError("The name does not match. Type the user's name exactly to continue.");
      return }
    const target = deleteTarget;
    setBusy(true);
    setDeleteError("");
    try {
      await del(`/users/${target.id}`, { confirmationName });
      setDeleteTarget(null);
      setConfirmationName("");
      setNotice(
        `${target.name} was removed from Users. Their booking and payment history was retained.`
      );
      if (users.length === 1 && page > 1) setPage(current => Math.max(1, current - 1));
      else {
        try {
          await load()
        } catch (e: any) {
          setError(
            e.message ||
              "User was deleted, but the list could not refresh. Refresh the page to see the update."
          )
        }
      }
    } catch (e: any) {
      setDeleteError(e.message || "Could not delete user.")
    } finally {
      setBusy(false)
    }
  };
  return <Page
    title="Users"
    eyebrow="Accounts & identity"
    actions={
      <Button onClick={openCreate}>
        <Plus size={16} /> Create account</Button>
    }
  >
    <div className="member-refined">
    <p className="users-intro">Manage members, team access, and account activity.</p>
    <AnimatePresence>{notice && <Toast message={notice} onClose={() => setNotice("")} />}</AnimatePresence>
    {error &&
      <div
        role="alert"
        className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        {error}
      </div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <Card className="user-summary p-4">
        <p className="text-xs text-zawana-500">Matching accounts</p>
        <b className="text-2xl">{pageInfo.total}</b>
      </Card>
      <Card className="user-summary p-4">
        <p className="text-xs text-zawana-500">Members in results</p>
        <b className="text-2xl">{summary.members}</b>
      </Card>
      <Card className="user-summary p-4">
        <p className="text-xs text-zawana-500">Active in results</p>
        <b className="text-2xl">{summary.active}</b>
      </Card>
    </div>
    <Card className="user-list overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-zawana-500" />
          <input
            aria-label="Search users"
            className="w-full pl-9"
            placeholder="Search name, email or phone"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setPage(1)
            }}
          />
        </div>
        <select className="users-role-filter" aria-label="Account role" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>
          {["all", ...roles].map(value => <option key={value} value={value}>{value === 'all' ? 'All account roles' : label(value)}</option>)}
        </select>
      </div>
      {loading ?
        <div className="animate-pulse p-8 text-sm text-zawana-500">Loading accounts…</div> : users.length ?
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-zawana-900 text-[10px] uppercase tracking-wider text-zawana-500">
              <tr>
                {["User", "Role", "Status", "Created", "Last login", "Activity", "Actions"].map(
                  h =>
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zawana-950/5">
              {users.map(u =>
                <tr key={u.id} className="hover:bg-zawana-900/60">
                  <td className="px-4 py-4">
                    <div className="user-name"><span className="user-avatar" aria-hidden="true">{u.name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('')}</span><b>{u.name}</b></div>
                    <p className="text-xs text-zawana-500">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <Badge>{label(u.role)}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge good={u.active}>{u.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-xs">{stamp(u.lastLoginAt)}</td>
                  <td className="px-4 py-4 text-xs">
                    {u._count?.bookings || 0} bookings · {u._count?.badmintonEnrollments || 0} packages</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1">
                      <button
                        title="View activity"
                        onClick={() => openView(u)}
                        className="rounded-lg p-2 hover:bg-zawana-900"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        title="Edit account"
                        onClick={() => openEdit(u)}
                        className="rounded-lg p-2 hover:bg-zawana-900"
                      >
                        <Pencil size={16} />
                      </button>
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        disabled={busy}
                        onClick={() => toggle(u)}
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="danger"
                        className="px-2 py-1 text-xs"
                        disabled={busy}
                        onClick={() => remove(u)}
                      >
                        <Trash2 size={14} /> Delete</Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div> :
        <Empty title="No users found" body="Adjust your filters or create an account." />}
      <div className="border-t p-4">
        <Pagination
          page={pageInfo.page || page}
          totalPages={pageInfo.totalPages || 0}
          total={pageInfo.total || 0}
          onPage={setPage}
        />
      </div>
    </Card>
    <AnimatePresence>{mode &&
      <UserModal
        title={
          mode === "create"
            ? "Create account"
            : mode === "edit"
              ? "Edit account"
              : selected?.name || "User activity"
        }
        onClose={() => setMode(null)}
      >
        {mode === "view" ?
          <>
            {!activity ?
              <p className="p-8 text-center text-sm text-zawana-500">Loading account activity…</p> :
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="user-summary p-4">
                    <p className="text-xs text-zawana-500">Bookings</p>
                    <b className="text-xl">{activity.bookings?.length || 0}</b>
                  </Card>
                  <Card className="user-summary p-4">
                    <p className="text-xs text-zawana-500">Badminton packages</p>
                    <b className="text-xl">{activity.badmintonEnrollments?.length || 0}</b>
                  </Card>
                  <Card className="user-summary p-4">
                    <p className="text-xs text-zawana-500">Payments & transactions</p>
                    <b className="text-xl">{activity.transactions?.length || 0}</b>
                  </Card>
                </div>
                <Card className="user-summary p-4">
                  <h3 className="font-black">Recent activity</h3>
                  <div className="mt-3 space-y-2">
                    {[
                      ...(activity.bookings || []).map((x: any) => ({
                        key: `b-${x.id}`,
                        type: "Booking",
                        title: x.title,
                        when: `${x.date} · ${x.time}`,
                        state: x.status
                      })),
                      ...(activity.badmintonEnrollments || []).map((x: any) => ({
                        key: `p-${x.id}`,
                        type: "Badminton package",
                        title: x.packageName,
                        when: `${x.sessionsRemaining}/${x.sessionsTotal} sessions · Expires ${x.expiryDate}`,
                        state: x.status
                      })),
                      ...(activity.appointments || []).map((x: any) => ({
                        key: `a-${x.id}`,
                        type: "Clinic appointment",
                        title: x.type,
                        when: `${x.date} · ${x.time}`,
                        state: x.status
                      })),
                      ...(activity.transactions || []).map((x: any) => ({
                        key: `t-${x.id}`,
                        type: "Payment",
                        title: x.item,
                        when: `${x.date} · ${Number(x.finalAmount).toLocaleString()} MMK`,
                        state: x.status
                      }))
                    ]
                      .slice(0, 20)
                      .map((x: any) =>
                        <div
                          key={x.key}
                          className="flex items-center justify-between gap-3 rounded-xl bg-zawana-900 p-3"
                        >
                          <div>
                            <p className="text-[10px] font-bold uppercase text-zawana-500">
                              {x.type}
                            </p>
                            <b className="text-sm">{x.title}</b>
                            <p className="text-xs text-zawana-500">{x.when}</p>
                          </div>
                          <Badge>{label(x.state || "recorded")}</Badge>
                        </div>
                      )}
                  </div>
                </Card>
              </div>}
          </> :
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold">Name<input
                  className="mt-1 w-full"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="text-xs font-bold">Email / username<input
                  className="mt-1 w-full"
                  type="email"
                  disabled={mode === "edit"}
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="text-xs font-bold">Phone<input
                  className="mt-1 w-full"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="text-xs font-bold">Role<Select
                  className="mt-1 w-full"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  {roles.map(r =>
                    <option value={r} key={r}>
                      {label(r)}
                    </option>)}
                </Select>
              </label>
              {form.role === "coach" &&
                <>
                  <label className="text-xs font-bold">Coach department<Select
                      className="mt-1 w-full"
                      value={form.coachDepartment || "Badminton"}
                      onChange={e => setForm({ ...form, coachDepartment: e.target.value })}
                    >
                      <option>Badminton</option>
                      <option>Gym</option>
                    </Select>
                    <span className="mt-1 block font-normal text-zawana-500">Badminton coaches can be assigned to private courses.</span>
                  </label>
                  <div className="sm:col-span-2">
                    <ImageUpload
                      label="Coach profile image"
                      value={coachImage}
                      onChange={value => {
                        setCoachImage(value);
                        setCoachImageDirty(true)
                      }}
                    />
                  </div>
                </>}
              {mode === "create" || passwordOpen ?
                <label className="text-xs font-bold sm:col-span-2">
                  {mode === "create" ? "Temporary password" : "New password (optional)"}
                  <input
                    className="mt-1 w-full"
                    type="password"
                    minLength={mode === "create" ? 8 : 0}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <span className="mt-1 block font-normal text-zawana-500">
                    {mode === "create"
                      ? "At least 8 characters."
                      : "Leave blank to keep the current password."} Passwords are hashed before storage.</span>
                </label> :
                <button
                  type="button"
                  className="text-left text-xs font-bold text-zawana-accent"
                  onClick={() => setPasswordOpen(true)}
                >Set a new password</button>}
              {mode === "edit" &&
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm({ ...form, active: e.target.checked })}
                  /> Account active</label>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button>
              <Button
                disabled={
                  busy ||
                  !form.name ||
                  !form.email ||
                  (mode === "create" && form.password.length < 8)
                }
                onClick={save}
              >
                {busy ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
              </Button>
            </div>
          </>}
      </UserModal>}</AnimatePresence>
    <AnimatePresence>{deleteTarget &&
      <UserModal
        title="Delete user account?"
        onClose={() => {
          if (!busy) {
            setDeleteTarget(null);
            setDeleteError("")
          }
        }}
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">This removes <b>{deleteTarget.name}</b> from the Users list and disables their sign-in. Existing bookings, packages, and payment history are kept for records.</div>
          <label
            htmlFor="confirm-delete-user"
            className="block text-sm font-bold text-zawana-950"
          >To confirm, type <span className="select-all">{deleteTarget.name}</span>
            <input
              id="confirm-delete-user"
              autoFocus
              autoComplete="off"
              className="mt-2 w-full"
              value={confirmationName}
              onChange={e => {
                setConfirmationName(e.target.value);
                setDeleteError("")
              }}
              placeholder={deleteTarget.name}
              onKeyDown={e => {
                if (e.key === "Enter" && confirmationName === deleteTarget.name)
                  void confirmDelete()
              }}
            />
          </label>
          {deleteError &&
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {deleteError}
            </p>}
          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <Button variant="secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={busy || confirmationName !== deleteTarget.name}
              onClick={() => void confirmDelete()}
            >
              <Trash2 size={15} />
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </div>
      </UserModal>}</AnimatePresence>
    <div className="mt-5 flex items-center gap-2 text-xs text-zawana-500">
      <ShieldCheck size={14} /> Public signups remain members. Staff roles can only be provisioned here by an administrator.<UserRound size={14} />
    </div>
    </div>
  </Page>
}
