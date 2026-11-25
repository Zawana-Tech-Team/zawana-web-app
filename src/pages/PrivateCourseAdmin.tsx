import { useOperationalActions } from '../context/OperationalActionsContext';
import { PendingActionCounter } from '../components/operational-actions/OperationalActionUI';
import { Link } from 'react-router-dom';
import { SegmentedControl, SelectionContent } from "../components/Interactions";
import { DeskDialog } from "../components/court-desk/DeskDialog";
import { PrivateCourseRequests } from "../components/PrivateCourseRequests";
import "./private-course-management.css";
import { Select } from "../components/Select";
import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Plus,
  Power,
  Trash2,
  Search,
  X,
  ImagePlus,
  Clock3,
  DollarSign,
} from "lucide-react";
import { Badge, Button, Card, Empty, Page } from "../components/UI";
import { del, get, patch, post } from "../api";
import { mediaImageSrc } from "../components/ImageUpload";

const blank = {
  title: "",
  description: "",
  duration: 60,
  price: 0,
  category: "Private Training",
  status: "active",
  coachIds: [] as string[],
};

export function PrivateCourseAdmin() {
  const { counts: operationalCounts } = useOperationalActions();
  const [editorOpen, setEditorOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [items, setItems] = useState<any[]>([]),
    [coaches, setCoaches] = useState<any[]>([]),
    [form, setForm] = useState<any>(blank),
    [editing, setEditing] = useState<string | null>(null),
    [image, setImage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [activeTab, setActiveTab] = useState<"catalog" | "requests">("catalog");
  const saveLock = useRef(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<any>(null);
  const [imageReading, setImageReading] = useState(false);
  const load = () => {
    setLoading(true);
    setError("");
    return Promise.all([get<any[]>("/private-courses"), get<any[]>("/coaches")])
      .then(([courses, profiles]) => {
        setItems(courses);
        setCoaches(
          profiles.filter(
            (c: any) =>
              c.department === "Badminton" &&
              c.status === "active" &&
              c.user?.active,
          ),
        );
      })
      .catch((e: any) =>
        setError(e.message || "Could not load course catalog."),
      )
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void load();
  }, []);
  const start = (c?: any) => {
    setFormError("");
    setEditorOpen(true);
    setEditing(c?.id || null);
    setImage(c?.imageUrl || "");
    setForm(
      c
        ? {
            title: c.title,
            description: c.description,
            duration: c.duration,
            price: c.price,
            category: c.category || "Private Training",
            status: c.status,
            coachIds: (c.coaches || []).map((x: any) => x.id),
          }
        : { ...blank },
    );
  };
  const save = async () => {
    if (saveLock.current || imageReading) return;
    saveLock.current = true;
    setBusy(true);
    setFormError("");
    let detailsSaved = false;
    try {
      const upload = image.startsWith('data:image/');
      const payload = { ...form, ...(!upload ? { imageUrl: image || null } : {}) };
      const saved = editing
        ? await patch<any>(`/private-courses/${editing}`, payload)
        : await post<any>("/private-courses", payload);
      setEditing(saved.id);
      detailsSaved = true;
      if (upload) await post(`/private-courses/${saved.id}/image`, { image });
      setEditorOpen(false);
      setNotice(editing ? "Course updated." : "Course created.");
      await load();
    } catch (e: any) {
      setFormError(detailsSaved ? `Course details saved. ${e.message || "The image could not be uploaded."} Save again to retry the image.` : e.message || "Could not save course.");
      if (detailsSaved) await load();
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  };
  const mutateCourse = async (course: any, action: "remove" | "status") => {
    if (saveLock.current) return;
    saveLock.current = true; setBusy(true); setError(""); setFormError("");
    try {
      if (action === "remove") await del(`/private-courses/${course.id}`);
      else await patch(`/private-courses/${course.id}`, { status: course.status === "active" ? "inactive" : "active" });
      setRemoving(null);
      setNotice(action === "remove" ? "Course removed from the catalog. Existing bookings are preserved." : "Course availability updated.");
      await load();
    } catch (cause: any) {
      if (action === "remove") setFormError(cause.message || "Could not remove course.");
      else setError(cause.message || "Could not update course availability.");
    } finally { saveLock.current = false; setBusy(false); }
  };
  const visibleItems = items.filter(
    (c) =>
      (statusFilter === "all" || c.status === statusFilter) &&
      `${c.title} ${c.category} ${c.description || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <Page
      title="Private courses"
      eyebrow="Badminton"
      actions={<div className="private-course-heading-actions"><Link className="private-course-booking-link" to="/admin/court-rentals">Create a private booking</Link><Button disabled={busy} onClick={() => { setActiveTab('catalog'); start(); }}><Plus size={16} aria-hidden="true"/>New course</Button></div>}
    ><div className="private-course-management">
      <SegmentedControl
        value={activeTab}
        onChange={value => { setActiveTab(value); setNotice(""); }}
        label="Course views"
        className="mb-6 w-fit"
        options={[
          { value: "catalog", label: "Course catalog" },
          { value: "requests", label: <>Booking requests<PendingActionCounter count={operationalCounts.private_course} label="Private course requests"/></> },
        ]}
      />
      {notice && <p role="status" className="private-course-notice">{notice}</p>}
      <SelectionContent value={activeTab}>
        {activeTab === "requests" ? (
          <PrivateCourseRequests coaches={coaches} />
        ) : (
          <div className="space-y-6">
            <section>
              <div className="private-course-catalog-tools">
                <div className="relative w-full sm:max-w-xs">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zawana-400"
                  />
                  <input
                    className="w-full rounded-xl border py-2.5 !pl-10 pr-3"
                    aria-label="Search courses"
                    placeholder="Find a course"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>

                <Select
                  aria-label="Course status"
                  className="min-w-40 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              {error && !editorOpen && (
                <p
                  role="alert"
                  className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                >
                  {error} <Button variant="secondary" onClick={() => void load()}>Retry courses</Button>
                </p>
              )}
              {loading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {[1, 2, 3, 4].map((n) => (
                    <Card
                      key={n}
                      className="h-64 animate-pulse bg-zawana-950/5"
                    />
                  ))}
                </div>
              ) : error && !items.length ? null : visibleItems.length ? (
                <div className="private-course-catalog-grid">
                  {visibleItems.map((c) => (
                    <article key={c.id} aria-label={`Course ${c.title}`} className="private-course-card">
                      {c.imageUrl ? (
                        <img
                          src={mediaImageSrc(c.imageUrl)}
                          alt=""
                          className="private-course-card-image"
                        />
                      ) : (
                        <div className="flex h-20 items-center gap-2 border-b border-zawana-border bg-zawana-gold/5 px-5">
                          <Clock3 size={17} className="text-zawana-500" />
                          <span className="text-xs font-medium text-zawana-500">
                            Private coaching
                          </span>
                        </div>
                      )}
                      <div className="private-course-card-body">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">
                              {c.category}
                            </p>
                            <h2 className="mt-1 text-lg font-semibold tracking-tight">
                              {c.title}
                            </h2>
                          </div>
                          <Badge good={c.status === "active"}>{c.status}</Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-zawana-500">
                          {c.description}
                        </p>
                        <div className="private-course-card-facts">
                          <div className="rounded-xl bg-zawana-950/[.04] p-3">
                            <Clock3 size={14} className="text-zawana-accent" />
                            <b className="mt-1 block text-sm">
                              {c.duration} min
                            </b>
                          </div>
                          <div className="rounded-xl bg-zawana-950/[.04] p-3">
                            <DollarSign
                              size={14}
                              className="text-zawana-accent"
                            />
                            <b className="mt-1 block text-sm">
                              {Number(c.price).toLocaleString()} MMK
                            </b>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {c.coaches?.map((p: any) => (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-2 rounded-full bg-zawana-950/5 px-2 py-1.5 text-xs"
                            >
                              {p.imageUrl ? <img src={mediaImageSrc(p.imageUrl)} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span aria-hidden="true" className="h-7 w-7 rounded-full grid shrink-0 place-items-center bg-zawana-950/5 text-xs font-semibold text-zawana-500">{p.name?.slice(0, 1)}</span>}
                              {p.name}
                            </span>
                          ))}
                        </div>
                        <div className="private-course-card-actions">
                          <Button
                            variant="secondary"
                            className="px-3 py-2"
                            disabled={busy}
                            aria-label={`Edit course ${c.title}`}
                            onClick={() => start(c)}
                          >
                            <Pencil size={14} /> Edit
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2"
                            disabled={busy}
                            onClick={() => void mutateCourse(c, "status")}
                          >
                            <Power size={14} />
                            {c.status === "active" ? "Deactivate" : "Activate"}
                          </Button>
                          <button
                            aria-label={`Remove course ${c.title}`}
                            disabled={busy}
                            className="ml-auto rounded-xl p-2 text-red-700 hover:bg-red-50"
                            onClick={() => { setFormError(""); setRemoving(c); }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title={query || statusFilter !== "all" ? "No matching courses" : "No private courses"}
                  body={
                    query || statusFilter !== "all"
                      ? "Try a different search."
                      : "Create the first badminton coaching service."
                  }
                />
              )}
            </section>
            {editorOpen && (
              <DeskDialog title={editing ? 'Edit private course' : 'Create private course'} heading={editing ? 'Edit course' : 'New course'} onClose={() => setEditorOpen(false)} busy={busy || imageReading} className="private-course-editor" actions={<Button type="submit" form="private-course-editor-form" disabled={busy||imageReading||form.title.trim().length<3||!Number.isInteger(form.duration)||form.duration<30||form.duration>180||!Number.isInteger(form.price)||form.price<0||form.coachIds.length===0} loading={busy}>{editing?'Save changes':'Create course'}</Button>}>
              <form id="private-course-editor-form" onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={busy || imageReading}>
                  <div className="private-course-fields space-y-4">
                    <label className="block text-xs font-bold">
                      Course name
                      <input
                        className="mt-1 w-full"
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                        required
                        minLength={3}
                        placeholder="Beginner Private Training"
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      Description
                      <textarea
                        aria-label="Description"
                        className="mt-1 w-full"
                        rows={3}
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                        placeholder="What will the player learn?"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs font-bold">
                        Category
                        <input
                          className="mt-1 w-full"
                          value={form.category}
                          onChange={(e) =>
                            setForm({ ...form, category: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs font-bold">
                        Duration · minutes
                        <input
                          className="mt-1 w-full"
                          type="number"
                          required
                          min={30}
                          max={180}
                          step={30}
                          value={form.duration}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              duration: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="private-course-price block text-xs font-bold">
                      Price · MMK
                      <input
                        className="mt-1 w-full"
                        type="number"
                        required
                        min={0}
                        step={1}
                        value={form.price}
                        onChange={(e) =>
                          setForm({ ...form, price: Number(e.target.value) })
                        }
                      />
                    </label>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-bold">
                          Assigned badminton coaches
                        </p>
                        <span className="text-[10px] text-zawana-500">
                          {form.coachIds.length} selected
                        </span>
                      </div>
                      {coaches.length ? (
                        <div className="private-course-coach-options">
                          {coaches.map((c) => {
                            const selected = form.coachIds.includes(c.id);
                            return (
                              <button
                                type="button"
                                key={c.id}
                                aria-pressed={selected}
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    coachIds: selected
                                      ? form.coachIds.filter(
                                          (id: string) => id !== c.id,
                                        )
                                      : [...form.coachIds, c.id],
                                  })
                                }
                                className={`flex items-center gap-3 rounded-xl border p-2 text-left transition ${selected ? "border-zawana-gold bg-zawana-gold/10" : "hover:border-zawana-950/25"}`}
                              >
                                {c.imageUrl ? <img src={mediaImageSrc(c.imageUrl)} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <span aria-hidden="true" className="h-11 w-11 rounded-lg grid shrink-0 place-items-center bg-zawana-950/5 text-xs font-semibold text-zawana-500">{c.name?.slice(0, 1)}</span>}
                                <span className="min-w-0 flex-1">
                                  <b className="block truncate text-xs">
                                    {c.name}
                                  </b>

                                </span>
                                <span
                                  className={`grid h-5 w-5 place-items-center rounded-full text-xs ${selected ? "bg-zawana-950 text-white" : "bg-zawana-950/5"}`}
                                >
                                  {selected ? "✓" : "+"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                          No linked active badminton coaches are available. Add
                          a Badminton coach account in Coach Management first.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-bold">Course image</p>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 hover:bg-zawana-950/[.02]">
                        <ImagePlus size={18} />
                        <span className="text-xs">
                          Choose image (PNG, JPG or WebP)
                          <input
                            className="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              if (f.size > 5 * 1024 * 1024) {
                                setFormError("Course images must be 5 MB or smaller.");
                                return;
                              }
                              if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { setFormError("Choose a PNG, JPG or WebP image."); return; }
                              const reader = new FileReader();
                              setImageReading(true);
                              reader.onerror = () => setFormError("Could not read this image. Please try another file.");
                              reader.onload = () => { setImage(String(reader.result || "")); setFormError(""); };
                              reader.onloadend = () => setImageReading(false);
                              reader.readAsDataURL(f);
                            }}
                          />
                        </span>
                      </label>
                      {imageReading && <p role="status" className="mt-2 text-xs text-zawana-500">Reading image…</p>}
                      {image && (
                        <div className="relative mt-2">
                          <img
                            src={mediaImageSrc(image)}
                            alt="Course preview"
                            className="h-44 w-full rounded-xl object-cover"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-2 grid min-h-11 min-w-11 place-items-center rounded-full bg-white p-2 shadow"
                            onClick={() => setImage("")}
                            aria-label="Remove course image"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-2 rounded-xl bg-zawana-950/[.04] p-3 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={form.status === "active"}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            status: e.target.checked ? "active" : "inactive",
                          })
                        }
                      />
                      Selectable by members
                    </label>
                    {formError && (
                      <p
                        role="alert"
                        className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                      >
                        {formError}
                      </p>
                    )}
                  </div>
              </fieldset></form>
              </DeskDialog>
            )}
          </div>
        )}
      </SelectionContent>
      {removing && <DeskDialog title="Remove private course?" heading="Remove course?" size="compact" onClose={() => setRemoving(null)} busy={busy} actions={<Button loading={busy} onClick={() => void mutateCourse(removing, "remove")}>Remove course</Button>}>
        <p className="text-sm leading-relaxed text-zawana-500">Remove <strong className="text-zawana-950">{removing.title}</strong> from the catalog? Existing bookings and their history will be preserved.</p>
        {formError && <p role="alert" className="private-course-error">{formError}</p>}
      </DeskDialog>}
    </div></Page>
  );
}

export default PrivateCourseAdmin;
