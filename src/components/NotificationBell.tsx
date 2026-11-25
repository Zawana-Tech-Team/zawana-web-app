import { createPortal } from 'react-dom';
import { startPayment } from '../services/paymentFlow';
import { useViewedNotifications } from '../hooks/useViewedNotifications';
import { INBOX_CHANGED, INBOX_REFRESH, removeViewedNotifications } from '../services/notificationInbox';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { popoverMotion } from '../design/motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Check, Volume2, VolumeX, X } from 'lucide-react';
import { NotificationGraphic, notificationTimestamp } from './notification/NotificationPresentation';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { LocalizedTree, useLanguage } from '../context/LanguageContext';

export function NotificationBell() {
  const reduced = useReducedMotion();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { t, locale } = useLanguage();
  const [items, setItems] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [sound, setSound] = useState(() => localStorage.getItem('zawana_notification_sound') === 'on'),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const { user } = useAuth();
  const userId = user?.id, userRole = user?.role;
  const staff=userRole==='admin'||userRole==='badminton_fo';
  const [owner,setOwner]=useState('');
  const visibleItems=owner===userId?items:[];
  const [position,setPosition]=useState<{top:number;left:number;width:number;maxHeight:number}|null>(null);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{const rect=trigger.current?.getBoundingClientRect();if(!rect)return;const viewport=window.visualViewport;const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;const panelWidth=Math.min(390,width-16),panelHeight=Math.min(560,height-16);const below=top+height-rect.bottom-14,above=rect.top-top-14;const flip=below<250&&above>below;setPosition({width:panelWidth,left:Math.max(left+8,Math.min(rect.right-panelWidth,left+width-panelWidth-8)),top:flip?Math.max(top+8,rect.top-Math.min(panelHeight,above)-6):rect.bottom+6,maxHeight:Math.max(80,Math.min(panelHeight,flip?above:below))});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.visualViewport?.addEventListener('resize',place);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);};
  },[open]);
  useViewedNotifications(panel, open, userId);
  const seen = useRef<Set<string> | null>(null),
    allowed = useRef(false),
    navigate = useNavigate();
  const play = useCallback(() => {
    if (!allowed.current || !sound || document.hidden) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value =.045;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime +.12);
      oscillator.onended = () => void ctx.close()
    } catch {}
  }, [sound]);
  useEffect(() => {
    const unlock = () => {
      allowed.current = true
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock)
  }, []);
  useEffect(() => {
    setItems([]); seen.current = null;
    if (!userId) { setLoading(false); return; }
    let alive = true, revision = 0;
    const cleared = new Set<string>();
    const refresh = async () => {
      const requestId = ++revision;
      try {
        const result = await get<any[]>('/notifications');
        if (!alive || revision !== requestId) return;
        const active = result.filter(n => !cleared.has(n.id) && n.activeInInbox !== false && (!n.expiresAt || new Date(n.expiresAt).getTime() > Date.now()));
        if (seen.current) {
          const fresh = active.filter(n => !seen.current!.has(n.id) && !n.read);
          if (fresh.length) play()
        }
        seen.current = new Set(active.map(n => n.id));
        setOwner(userId);setItems(active);setError('');
        setLoading(false)
      } catch {
        if (alive) {setLoading(false);setError('Notifications could not refresh. Check your connection and retry.');}
      }
    };
    const remove = (event: Event) => { const ids = (event as CustomEvent<{ ids: string[] }>).detail.ids; ++revision; ids.forEach(id => cleared.add(id)); setItems(rows => rows.filter(row => !ids.includes(row.id))); };
    const refreshEvent = () => { if(!document.hidden)void refresh(); };
    window.addEventListener(INBOX_CHANGED, remove); window.addEventListener(INBOX_REFRESH, refreshEvent); window.addEventListener('focus', refreshEvent);window.addEventListener('online',refreshEvent);document.addEventListener('visibilitychange',refreshEvent);
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(INBOX_CHANGED, remove); window.removeEventListener(INBOX_REFRESH, refreshEvent); window.removeEventListener('focus', refreshEvent);window.removeEventListener('online',refreshEvent);document.removeEventListener('visibilitychange',refreshEvent);
    }
  }, [play, userId, userRole]);
  useEffect(() => {
    if (!open) return;
    const opener=trigger.current;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', dismiss);
    return () => {document.removeEventListener('keydown', dismiss);if(opener?.isConnected)opener.focus({preventScroll:true});};
  }, [open]);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    localStorage.setItem('zawana_notification_sound', next ? 'on' : 'off');
    allowed.current = true
  };
  const openItem = async (item: any) => {
    try {
      await removeViewedNotifications([item.id]);
      setOpen(false);
      if (item.link) navigate(item.link);
    } catch { setError('Could not clear this notification. Please try again.'); }
  };
  const finishAction = async (item: any, action: () => Promise<any>) => {
    if (!item.entityId || busy) return;
    setBusy(item.id);
    setError('');
    try {
      const result = await action();
      setItems(xs => xs.filter(x => x.id !== item.id));
      void removeViewedNotifications([item.id]).catch(() => {});
      if (result?.message)
        window.dispatchEvent(new CustomEvent('zawana-toast', { detail: result.message }))
    } catch (e: any) {
      setError(e.message || 'Could not update this request.')
    } finally {
      setBusy('')
    }
  };
  const decide = (item: any, decision: 'accept' | 'decline') =>
    finishAction(item, () =>
      post(`/coach/private-courses/${item.entityId}/decision`, { decision })
    );
  const confirmBooking = async (item: any) => {
    if (!item.entityId || busy) return;
    setBusy(item.id); setError('');
    try { await startPayment(`/member/private-courses/${item.entityId}/pay`); setItems(rows => rows.filter(row => row.id !== item.id)); await removeViewedNotifications([item.id]).catch(() => {}); }
    catch (e: any) { setError(e.message || 'Could not start payment.'); }
    finally { setBusy(''); }
  };
  const cancelBooking = (item: any) =>
    finishAction(item, () => post(`/member/private-courses/${item.entityId}/cancel`, {}));
  const unread = visibleItems.filter(n => !n.read).length;
  return <LocalizedTree>
    <div className="relative">
      <button
        ref={trigger} type="button" aria-expanded={open} aria-controls={open ? "notification-panel" : undefined}
        aria-label={`${t('Notifications')}${unread ? `, ${t(`${unread} unread`)}` : ''}`}
        onClick={() => {setPosition(null);setOpen(v => !v);}}
        className={`relative grid h-10 w-10 place-items-center rounded-full hover:bg-zawana-950/5 ${staff?'staff-notification-trigger':''}`}
      >
        <Bell size={19} />
        {unread > 0 &&
          <span className="absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>}
      </button>
      {createPortal(<LocalizedTree><AnimatePresence>{open &&
        <>
          <button
            aria-label="Close notifications"
            tabIndex={-1} className="fixed inset-0 z-[140] cursor-default"
            onClick={() => setOpen(false)}
          />
          <motion.section ref={panel} id="notification-panel" aria-label="Notifications"
            {...popoverMotion} initial={reduced ? false : popoverMotion.initial}
            transition={reduced ? { duration: 0 } : popoverMotion.transition}
            style={{...position,visibility:position?'visible':'hidden'}} className={`premium-popover fixed z-[150] flex flex-col overflow-hidden rounded-2xl border border-zawana-950/10 bg-white shadow-2xl ${staff?'staff-notification-popover':''}`}>
            <header className="flex items-center justify-between border-b border-zawana-950/10 p-4">
              <div>
                <h2 className="font-semibold">Notifications{staff&&unread>0&&<span className="staff-notification-count">{unread} unread</span>}</h2>
                {!staff&&<p className="text-xs text-zawana-500">
                  {unread ? `${unread} unread` : 'You’re all caught up'}
                </p>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  title={sound ? 'Turn sound off' : 'Turn sound on'}
                  aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
                  onClick={toggleSound}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg p-2 hover:bg-zawana-950/5"
                >
                  {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                </button>
                <button
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg p-2 hover:bg-zawana-950/5"
                >
                  <X size={17} />
                </button>
              </div>
            </header>
            {error &&
              <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                {error}<button className="ml-2 min-h-10 underline" onClick={()=>window.dispatchEvent(new Event(INBOX_REFRESH))}>Retry</button>
              </p>}
            <div className="min-h-0 overflow-y-auto">
              {loading ?
                <div className="space-y-2 p-4">
                  <div className="h-14 animate-pulse rounded-xl bg-zawana-950/5" />
                  <div className="h-14 animate-pulse rounded-xl bg-zawana-950/5" />
                </div> : visibleItems.length ?
                (staff?visibleItems.slice(0,6):visibleItems).map(item => {
                  const request =
                    user?.role === 'coach' &&
                    item.type === 'booking' &&
                    item.entityType === 'booking' &&
                    item.entityId &&
                    item.title === 'New private course request';
                  const memberPay =
                    user?.role === 'member' &&
                    item.type === 'booking' &&
                    item.entityType === 'booking' &&
                    item.entityId &&
                    item.title === 'Coach confirmed your private course';
                  return <div
                    key={item.id}
                    data-notification-id={item.id}
                    className={staff?`staff-notification-preview ${!item.read?'is-unread':''}`:`border-b border-zawana-950/10 p-4 ${item.read ? 'opacity-70' : 'bg-zawana-accent/[.06]'}`}
                  >
                    <button
                      onClick={() => void openItem(item)}
                      className="flex w-full gap-3 text-left"
                    >
                      {staff?<NotificationGraphic notice={item}/>:<span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-zawana-950/5 text-zawana-accent">
                        {item.imageUrl ?
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          /> :
                          <Bell size={17} />}
                      </span>}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <b className="text-sm">{item.title}</b>
                          {!item.read &&
                            <i className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zawana-accent" />}
                        </span>
                        <span className={`mt-1 block text-xs leading-5 text-zawana-500 ${staff?'staff-notification-preview-body':''}`}>
                          {item.body}
                        </span>
                        <span className="mt-2 block text-[10px] font-bold text-zawana-400">
                          {staff?notificationTimestamp(item.createdAt,locale):new Date(item.createdAt).toLocaleString(locale)}
                        </span>
                      </span>
                    </button>
                    {request &&
                      <div className="mt-3 flex gap-2 pl-[52px]">
                        <button
                          disabled={!!busy}
                          onClick={() => void decide(item, 'decline')}
                          className="min-h-10 flex-1 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 disabled:opacity-50"
                        >
                          {busy === item.id ? 'Saving…' : 'Decline'}
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() => void decide(item, 'accept')}
                          className="min-h-10 flex-1 rounded-xl bg-zawana-950 px-3 text-xs font-black text-white disabled:opacity-50"
                        >
                          {busy === item.id ? 'Saving…' : 'Accept'}
                        </button>
                      </div>}
                    {memberPay &&
                      <div className="mt-3 flex gap-2 pl-[52px]">
                        <button
                          disabled={!!busy}
                          onClick={() => void cancelBooking(item)}
                          className="min-h-10 flex-1 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 disabled:opacity-50"
                        >
                          {busy === item.id ? 'Saving…' : 'Cancel booking'}
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() => void confirmBooking(item)}
                          className="min-h-10 flex-1 rounded-xl bg-zawana-950 px-3 text-xs font-black text-white disabled:opacity-50"
                        >
                          {busy === item.id ? 'Starting payment…' : 'Confirm simulated payment'}
                        </button>
                      </div>}
                  </div>
                }) :
                <div className="p-8 text-center text-sm text-zawana-500">
                  <Check className="mx-auto mb-2" />No active notifications.</div>}
            </div>
            {staff&&<footer className="staff-notification-popover-footer"><Link to={`/${userRole==='admin'?'admin':'badminton-fo'}/notifications`} onClick={()=>setOpen(false)}>View all notifications<ArrowRight size={15} aria-hidden="true"/></Link></footer>}
          </motion.section>
        </>}</AnimatePresence></LocalizedTree>,document.body)}
    </div>
  </LocalizedTree>
}
