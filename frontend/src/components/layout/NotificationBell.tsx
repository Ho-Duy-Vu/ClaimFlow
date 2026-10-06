'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Bell, CheckCheck, ClipboardCheck, CreditCard, Info, ShieldAlert, ShieldCheck, Wallet,
} from 'lucide-react';
import api from '@/lib/api';
import type { AppNotification } from '@/types';

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/^http/, 'ws');

const ICON_BY_TYPE: Record<string, typeof Bell> = {
  claim_reviewed: ClipboardCheck,
  claim_info_requested: Info,
  claim_paid: Wallet,
  policy_purchased: ShieldCheck,
  policy_expiring: ShieldAlert,
  policy_expired: ShieldAlert,
  payment_due: CreditCard,
  system: Bell,
};

function timeAgo(iso: string, t: (k: string, v?: Record<string, number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('justNow');
  if (m < 60) return t('minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('hoursAgo', { n: h });
  return t('daysAgo', { n: Math.floor(h / 24) });
}

export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ items: AppNotification[]; unread: number }>('/notifications', {
        params: { limit: 20 },
      });
      setItems(r.data.items);
      setUnread(r.data.unread);
    } catch { /* not logged in / offline — ignore */ }
  }, []);

  // Initial load + periodic poll (WS handles the FastAPI process; polling catches
  // notifications created by the separate Celery worker process too).
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  // Realtime — per-user WebSocket channel
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_BASE}/notifications/ws`);
      } catch { return; }
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.event === 'notification') {
            setItems((prev) => [{
              id: data.id, type: data.type, title: data.title, body: data.body,
              link: data.link, read: false, created_at: data.created_at,
            }, ...prev].slice(0, 20));
            setUnread((u) => u + 1);
          }
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 5000); };
      ws.onerror = () => { ws?.close(); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAllRead = async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await api.patch('/notifications/read-all'); } catch { /* ignore */ }
  };

  const openItem = async (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try { await api.patch(`/notifications/${n.id}/read`); } catch { /* ignore */ }
    }
    setOpen(false);
    if (n.link) router.push(`/${locale}${n.link}`);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="relative w-8.5 h-8.5 flex items-center justify-center rounded-full text-[#13426f] hover:bg-[#bde1f9]/40 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
        aria-label={t('title')}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-gray-900 border border-[#d0d5dd] dark:border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#d0d5dd] dark:border-gray-700 bg-[#f9f7f0] dark:bg-gray-800/80">
            <span className="text-xs font-bold text-[#13426f] dark:text-gray-100 uppercase tracking-wider">{t('title')}</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#2e96ff] font-bold hover:underline flex items-center gap-1">
                <CheckCheck size={13} /> {t('markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                <Bell size={28} className="mx-auto mb-2 opacity-40" /> {t('empty')}
              </div>
            ) : (
              items.map((n) => {
                const Icon = ICON_BY_TYPE[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      n.read ? '' : 'bg-blue-50/60 dark:bg-blue-950/30'
                    }`}
                  >
                    <div className={`mt-0.5 shrink-0 ${n.read ? 'text-gray-400' : 'text-blue-600'}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${n.read ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.created_at, t)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
