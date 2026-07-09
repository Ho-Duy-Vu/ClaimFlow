'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  MessageCircle,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import type { User } from '@/types';

type Role = 'user' | 'reviewer' | 'admin';

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  allowed: Role[];
}

export function Sidebar() {
  const t = useTranslations('nav');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the current user once — the sidebar lives in the (app) layout and is NOT
  // remounted when navigating between sibling routes, so re-fetching on every
  // pathname change is wasteful (extra request + loading flash each nav).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<User>('/auth/me');
        if (!cancelled) setUser(r.data);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allLinks: NavLink[] = [
    { href: `/${locale}/dashboard`, label: t('dashboard'), icon: LayoutDashboard, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/documents`, label: t('documents'), icon: FileText, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/risk-map`,  label: t('riskMap'),  icon: Map, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/claims`,    label: t('claims'),   icon: ClipboardList, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/policies`,  label: t('policies'), icon: Shield, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/analytics`, label: t('analytics'), icon: BarChart3, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/chatbot`,   label: t('chatbot'),  icon: MessageCircle, allowed: ['user', 'reviewer', 'admin'] },
    { href: `/${locale}/reviewer`,  label: t('reviewer'), icon: ShieldCheck, allowed: ['reviewer', 'admin'] },
    { href: `/${locale}/admin`,     label: t('admin'),    icon: Users, allowed: ['admin'] },
  ];

  const role = (user?.role ?? 'user') as Role;
  const links = user ? allLinks.filter((l) => l.allowed.includes(role)) : [];

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    router.replace(`/${locale}/login`);
  };

  const roleBadgeCls: Record<Role, string> = {
    admin:    'bg-red-500/20 text-red-300 border-red-500/30',
    reviewer: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    user:     'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };

  const roleLabel: Record<Role, string> = {
    admin:    'Admin',
    reviewer: 'Reviewer',
    user:     'User',
  };

  return (
    <aside className="w-60 bg-gray-900 text-white min-h-screen flex flex-col shrink-0">
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-blue-400 tracking-tight">ClaimFlow</h1>
        <p className="text-xs text-gray-400 mt-0.5">AI Insurance Platform</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 px-2 py-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          links.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })
        )}
      </nav>

      {user && (
        <div className="p-3 border-t border-gray-700 space-y-2">
          <div className="px-2">
            <p className="text-sm font-medium text-white truncate">
              {user.full_name ?? user.email}
            </p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleBadgeCls[role]}`}>
                {roleLabel[role]}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut size={15} />
            {tAuth('logout')}
          </button>
        </div>
      )}
    </aside>
  );
}
