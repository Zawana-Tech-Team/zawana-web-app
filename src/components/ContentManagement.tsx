import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Clock3, Eye, FileText, Pencil, Plus, RefreshCw, Search, Trash2, Trophy } from 'lucide-react';
import { del, get, patch, post } from '../api';
import type { ContentItem } from '../types';
import { gymToday } from '../types/gym';
import { publicationDate, publicImageSrc } from '../utils/publicContent';
import { SegmentedControl } from './Interactions';
import { ImageUpload } from './ImageUpload';
import { Button, Empty, Page } from './UI';
import { Select } from './Select';
import { DeskDialog } from './court-desk/DeskDialog';
import { HistoryPagination } from './member-booking/HistoryPagination';
import './management-workspace.css';

type Draft = Omit<ContentItem, 'id'>;
const blank = (): Draft => ({ kind: 'achievement', category: 'Milestones', body: '', title: '', description: '', image: '', googleFormLink: '', status: 'draft', publishDate: gymToday() });
const stateOf = (item: ContentItem, today: string) => item.status !== 'published' ? 'draft' : item.publishDate > today ? 'scheduled' : 'live';
const stateLabel = { live: 'Live', draft: 'Draft', scheduled: 'Scheduled' };

export function ContentManagement() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [deleting, setDeleting] = useState<ContentItem | null>(null);
  const [form, setForm] = useState<Draft>(blank);
  const [action, setAction] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const lock = useRef(false);
  const loadVersion = useRef(0);
  const mounted = useRef(false);
  const today = gymToday();
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError('');
    try {
      const content = await get<ContentItem[]>('/admin/content');
      if (mounted.current && version === loadVersion.current) setItems(content);
    } catch (cause: unknown) {
      if (mounted.current && version === loadVersion.current) setLoadError(cause instanceof Error ? cause.message : 'Could not load content.');
    } finally { if (mounted.current && version === loadVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  const start = (item?: ContentItem, type: ContentItem['kind'] = 'achievement') => {
    setEditing(item || null); setFormError(''); setActionError(''); setNotice('');
    setForm(item ? { title: item.title, kind: item.kind, category: item.category, description: item.description, body: item.body, image: item.image, googleFormLink: item.googleFormLink, status: item.status, publishDate: item.publishDate } : { ...blank(), kind: type });
    setOpen(true);
  };
  const save = async () => {
    if (lock.current || imageUploading) return;
    lock.current = true; setAction('save'); setFormError('');
    try {
      const payload = { ...form, title: form.title.trim(), publishDate: form.publishDate || today };
      const saved = editing ? await patch<ContentItem>(`/content/${editing.id}`, payload) : await post<ContentItem>('/content', payload);
      setItems(current => editing ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
      setOpen(false); setNotice(editing ? 'Content updated.' : 'Content created.');
    } catch (cause: unknown) { setFormError(cause instanceof Error ? cause.message : 'Could not save content.'); }
    finally { lock.current = false; setAction(''); }
  };
  const publish = async (item: ContentItem) => {
    if (lock.current) return;
    lock.current = true; setAction(item.id); setActionError(''); setNotice('');
    try {
      const saved = await patch<ContentItem>(`/content/${item.id}/publish`, {});
      setItems(current => current.map(row => row.id === saved.id ? saved : row));
      setNotice(`${saved.title} is now live.`);
    } catch (cause: unknown) { setActionError(cause instanceof Error ? cause.message : 'Could not publish content.'); }
    finally { lock.current = false; setAction(''); }
  };
  const remove = async () => {
    if (!deleting || lock.current) return;
    lock.current = true; setAction('delete'); setFormError('');
    try {
      await del(`/content/${deleting.id}`);
      setItems(current => current.filter(item => item.id !== deleting.id));
      setDeleting(null); setNotice('Content deleted.');
    } catch (cause: unknown) { setFormError(cause instanceof Error ? cause.message : 'Could not delete content.'); }
    finally { lock.current = false; setAction(''); }
  };
  const filtered = items.filter(item => (kind === 'all' || item.kind === kind) && (!status || stateOf(item, today) === status) && `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 9));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 9, currentPage * 9);
  const busy = Boolean(action);
  const canSave = Boolean(form.title.trim()) && (form.status !== 'published' || form.kind !== 'achievement' || Boolean(form.description.trim() && form.body.trim()));
  return <Page title="Content & achievements" eyebrow="Administration" actions={<div className="management-heading-actions"><Button variant="secondary" disabled={busy || loading} onClick={() => start(undefined, 'community')}><Plus size={16} aria-hidden="true"/>Community update</Button><Button disabled={busy || loading} onClick={() => start()}><Plus size={16} aria-hidden="true"/>New achievement</Button></div>}>
    <div className="management-workspace content-management">
      <div className="content-navigation"><SegmentedControl label="Filter content type" value={kind} onChange={value => { setKind(value); setPage(1); }} options={[{ value: 'all', label: 'All content' }, { value: 'achievement', label: 'Achievements' }, { value: 'community', label: 'Community' }]}/><Link to="/achievements"><Eye size={16} aria-hidden="true"/>View achievements<ArrowUpRight size={14} aria-hidden="true"/></Link></div>
      <section className="management-tools" aria-label="Content filters"><label className="management-search"><Search size={17} aria-hidden="true"/><input aria-label="Search content" placeholder="Find a story or update" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
        <Select aria-label="Publication status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="live">Live</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option></Select>
        <Button variant="secondary" disabled={loading || busy} aria-label="Refresh content" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true"/></Button>
        {(query || status || kind !== 'all') && <Button variant="ghost" onClick={() => { setQuery(''); setKind('all'); setStatus(''); setPage(1); }}>Clear filters</Button>}
      </section>
      {notice && <p className="management-notice" role="status">{notice}</p>}
      {actionError && <p className="management-error" role="alert">{actionError}</p>}
      {loadError ? <div role="alert" className="management-error"><p>{loadError}</p><Button variant="secondary" onClick={() => void load()}>Retry content</Button></div>
        : loading ? <div className="management-loading" role="status">Loading content…</div>
        : visible.length ? <div className="content-grid">{visible.map(item => {
          const state = stateOf(item, today);
          const Icon = item.kind === 'achievement' ? Trophy : FileText;
          return <article key={item.id} aria-label={`Content ${item.title}`}>
            {item.image && publicImageSrc(item.image) ? <img className="content-card-image" src={publicImageSrc(item.image)} alt=""/> : <div className="content-card-placeholder"><Icon size={30} strokeWidth={1.25} aria-hidden="true"/></div>}
            <div className="content-card-body"><div className="content-card-category"><span>{item.kind === 'achievement' ? item.category : 'Community'}</span><span className="management-state" data-state={state}>{state === 'scheduled' && <Clock3 size={13} aria-hidden="true"/>}{stateLabel[state]}</span></div>
              <h2>{item.title}</h2>{item.description && <p className="content-card-description">{item.description}</p>}
              <p className="content-card-date"><CalendarDays size={15} aria-hidden="true"/>{item.publishDate ? publicationDate(item.publishDate) : 'No publish date'}</p>
              <div className="content-card-actions"><Button variant="secondary" disabled={busy} aria-label={`Edit ${item.title}`} onClick={() => start(item)}><Pencil size={14} aria-hidden="true"/>Edit</Button>
                {state !== 'live' ? <Button disabled={busy} loading={action === item.id} onClick={() => void publish(item)}>Publish now</Button> : item.kind === 'achievement' && <Link className="content-view-link" to={`/achievements/${item.id}`} aria-label={`View ${item.title}`}><Eye size={15} aria-hidden="true"/>View story</Link>}
                <Button variant="ghost" disabled={busy} className="content-delete" aria-label={`Delete ${item.title}`} onClick={() => { setFormError(''); setDeleting(item); }}><Trash2 size={16} aria-hidden="true"/></Button>
              </div>
            </div>
          </article>;
        })}</div> : <Empty title={query || status || kind !== 'all' ? 'No matching content' : 'Your next story starts here'} body={query || status || kind !== 'all' ? 'Try another search or clear your filters.' : 'Create an achievement or a community update.'}/>}
      {!loading && !loadError && <HistoryPagination page={currentPage} totalPages={pages} total={filtered.length} pageSize={9} noun="stories" label="Content pagination" onPage={setPage}/>}
    </div>
    {open && <DeskDialog title={editing ? 'Edit content' : 'Create a new story'} heading={editing ? 'Edit content' : form.kind === 'achievement' ? 'New achievement' : 'Community update'} className="management-dialog content-editor" busy={busy || imageUploading} onClose={() => setOpen(false)} actions={<Button form="content-editor" type="submit" loading={action === 'save'} disabled={busy || imageUploading || !canSave}>{imageUploading ? 'Uploading cover…' : 'Save story'}</Button>}>
      <form id="content-editor" className="management-form" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy || imageUploading}>
        <label>Title<input aria-label="Story title" required maxLength={180} value={form.title} placeholder="Give your story a title" onChange={event => setForm(current => ({ ...current, title: event.target.value }))}/></label>
        <div className="management-form-grid"><label>Post type<select aria-label="Post type" value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as ContentItem['kind'] }))}><option value="achievement">Achievement article</option><option value="community">Community update</option></select></label>
          <label>Category<select aria-label="Story category" value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value as ContentItem['category'] }))}>{['Milestones', 'Tournaments', 'Academy', 'Community'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <label>{form.kind === 'achievement' ? 'Summary' : 'Description'}<textarea aria-label="Story summary" rows={3} maxLength={3000} placeholder="A short introduction for readers" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))}/></label>
        {form.kind === 'achievement' && <label>Full article<textarea aria-label="Full article" className="content-article-input" rows={10} maxLength={100000} placeholder="Tell the full story…" value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))}/></label>}
        <ImageUpload label="Story cover image" value={form.image} onBusyChange={setImageUploading} onChange={url => setForm(current => ({ ...current, image: url || '' }))}/>
        <details className="content-editor-links" open={Boolean(form.googleFormLink) || undefined}><summary>Image URL & additional link</summary><div className="management-form-grid"><label>Cover image URL<input aria-label="Cover image URL" placeholder="https://… or /facilities/…" value={form.image} onChange={event => setForm(current => ({ ...current, image: event.target.value }))}/></label><label>More information URL<input aria-label="More information URL" type="url" placeholder="https://…" value={form.googleFormLink} onChange={event => setForm(current => ({ ...current, googleFormLink: event.target.value }))}/></label></div></details>
        <section className="content-publication" aria-label="Publication settings"><div className="management-form-grid"><label>Publication status<select aria-label="Content status" value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as ContentItem['status'] }))}><option value="draft">Draft</option><option value="published">Published</option></select></label><label>Publish date<input type="date" aria-label="Publish date" required value={form.publishDate} onChange={event => setForm(current => ({ ...current, publishDate: event.target.value }))}/></label></div>
          <p className="management-hint">{form.status === 'draft' ? 'Drafts are hidden from visitors.' : form.publishDate > today ? `Scheduled for ${publicationDate(form.publishDate)} · Yangon time` : `Publishes on ${form.kind === 'achievement' ? 'Achievements' : 'the homepage'}.`}</p>
          {form.kind === 'achievement' && form.status === 'published' && (!form.description.trim() || !form.body.trim()) && <p className="management-hint">Add a summary and full article to publish.</p>}
        </section>
        {formError && <p role="alert" className="management-error">{formError}</p>}
      </fieldset></form>
    </DeskDialog>}
    {deleting && <DeskDialog title="Delete content?" heading="Delete this story?" size="compact" className="management-dialog" busy={busy} onClose={() => setDeleting(null)} actions={<Button variant="danger" loading={action === 'delete'} onClick={() => void remove()}>Delete content</Button>}><p className="management-hint">Delete <strong>{deleting.title}</strong>? This removes it from the website and content catalog.</p>{formError && <p className="management-error" role="alert">{formError}</p>}</DeskDialog>}
  </Page>;
}
