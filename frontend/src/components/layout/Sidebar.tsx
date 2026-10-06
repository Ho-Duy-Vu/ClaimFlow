'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  MessageCircle,
  Shield,
  ShieldCheck,
  Sliders,
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

export function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void } = {}) {
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
    { href: `/${locale}/reviewer`,     label: t('reviewer'), icon: ShieldCheck, allowed: ['reviewer', 'admin'] },
    { href: `/${locale}/admin`,        label: t('admin'),    icon: Users, allowed: ['admin'] },
    { href: `/${locale}/underwriting`, label: 'Quy tắc thẩm định', icon: Sliders, allowed: ['admin'] },
    { href: `/${locale}/partners`,     label: 'Mạng lưới đối tác', icon: Building2, allowed: ['admin', 'reviewer'] },
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
    admin:    'bg-red-500/20 text-red-200 border-red-400/30',
    reviewer: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
    user:     'bg-[#2e96ff]/30 text-[#bde1f9] border-[#2e96ff]/40',
  };

  const roleLabel: Record<Role, string> = {
    admin:    'Admin',
    reviewer: 'Reviewer',
    user:     'User',
  };

  return (
    <aside
      className={`w-64 bg-[#13426f] text-white flex flex-col shrink-0 z-50
        fixed inset-y-0 left-0 h-screen transform transition-transform duration-200 shadow-[4px_0_24px_rgba(0,0,0,0.12)]
        md:static md:h-auto md:min-h-screen md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#2e96ff] flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)] shrink-0">
          <Shield size={18} className="stroke-[2.5]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5 leading-tight">
            ClaimFlow
          </h1>
          <p className="text-[11px] font-medium text-[#bde1f9] tracking-normal truncate">Insurance & Map Platform</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2.5 space-y-0.5 overflow-y-auto">
        {loading ? (
          <div className="space-y-1.5 px-2 py-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 bg-white/10 rounded-full animate-pulse" />
            ))}
          </div>
        ) : (
          links.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#2e96ff] text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-0.5'
                    : 'text-[#cde7fb] hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={16} className={isActive ? 'stroke-[2.5]' : ''} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })
        )}
      </nav>

      {user && (
        <div className="p-3.5 border-t border-white/10 space-y-2">
          <div className="p-2.5 bg-white/10 backdrop-blur-xs rounded-[18px] border border-white/15">
            <p className="text-xs font-bold text-white truncate">
              {user.full_name ?? user.email}
            </p>
            <div className="flex items-center justify-between mt-1 gap-2">
              <p className="text-[11px] text-[#bde1f9] truncate">{user.email}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleBadgeCls[role]}`}>
                {roleLabel[role]}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#cde7fb] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            {tAuth('logout')}
          </button>
        </div>
      )}
    </aside>
  );
}
