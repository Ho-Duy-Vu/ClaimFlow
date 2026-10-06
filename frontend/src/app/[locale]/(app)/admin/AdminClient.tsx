'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, AlertCircle, BarChart3, Ban, Building2, CheckCircle, Clock, CreditCard,
  DollarSign, FileText, Heart, Layers, Loader2, RefreshCw, ScrollText,
  Shield, ShieldAlert, ShieldOff, Sliders, Sparkles, Trash2, TrendingUp, Upload,
  Users as UsersIcon, Wallet, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import { getRelationshipLabel } from '@/lib/policy-helpers';
import type { User } from '@/types';
type TabKey = 'users' | 'userPolicies' | 'policies' | 'auditLogs' | 'systemHealth';

interface AdminUser extends User {
  created_at: string;
}

interface AuditLogItem {
  id: string;
  timestamp: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  ip_address: string | null;
}

interface PolicyDoc {
  id: string;
  title: string;
  category: string;
  version: string;
  is_active: boolean;
  chunk_count: number;
  coverage_types: string[];
  last_ingested: string | null;
  created_at: string;
  content_preview: string;
}

interface ServiceStatus {
  status: string;
  latency_ms?: number;
  error?: string;
  workers?: string[];
  collections?: string[];
}

interface SystemHealth {
  overall: string;
  services: Record<string, ServiceStatus>;
  checked_at: string;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function AdminClient() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();

  const [tab, setTab] = useState<TabKey>('users');
  const [authChecking, setAuthChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const qTab = searchParams.get('tab') as TabKey | null;
    if (qTab && ['users', 'userPolicies', 'policies', 'auditLogs', 'systemHealth'].includes(qTab)) {
      setTab(qTab);
    }
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<User>('/auth/me');
        if (r.data.role !== 'admin') {
          router.replace(`/${locale}/dashboard`);
          return;
        }
        setAllowed(true);
      } catch {
        router.replace(`/${locale}/login`);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, [locale, router]);

  if (authChecking) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }
  if (!allowed) {
    return <div className="text-center text-gray-500 mt-12">{t('noPermission')}</div>;
  }

  const tabs: Array<{ key: TabKey; label: string; icon: typeof UsersIcon }> = [
    { key: 'users', label: t('users'), icon: UsersIcon },
    { key: 'userPolicies', label: t('userPolicies'), icon: Wallet },
    { key: 'policies', label: t('policies'), icon: FileText },
    { key: 'auditLogs', label: t('auditLogs'), icon: ScrollText },
    { key: 'systemHealth', label: t('systemHealth'), icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-[#2e96ff] bg-[#eef6ff] px-2.5 py-0.5 rounded-full border border-[#2e96ff]/20 mb-1">
            Quản trị viên
          </span>
          <h1 className="text-2xl font-bold text-[#13426f] flex items-center gap-2">
            <Shield size={22} className="text-[#2e96ff]" /> {t('title')}
          </h1>
        </div>
      </div>

      <div className="bg-white/80 p-1.5 rounded-[18px] border border-[#d0d5dd] mb-6 inline-flex gap-1.5 shadow-xs overflow-x-auto no-scrollbar max-w-full">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-bold rounded-full transition-all whitespace-nowrap ${
              tab === key
                ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                : 'text-[#4a5568] hover:text-[#13426f] hover:bg-[#f9f7f0]'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'userPolicies' && <UserPoliciesTab />}
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'auditLogs' && <AuditLogsTab />}
      {tab === 'systemHealth' && <SystemHealthTab />}
    </div>
  );
}

// ── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (activeFilter) params.is_active = activeFilter;
      const r = await api.get<{ items: AdminUser[] }>('/admin/users', { params });
      setUsers(r.data.items);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, activeFilter]);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (u: AdminUser, newRole: string) => {
    if (newRole === u.role) return;
    const ok = await confirm({
      title: t('confirmRoleChangeTitle'),
      message: t('confirmRoleChange', { email: u.email, role: newRole }),
      confirmLabel: tCommon('confirm'),
      cancelLabel: tCommon('cancel'),
      variant: 'warning',
    });
    if (!ok) return;
    setBusy(u.id);
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role: newRole });
      await load();
      toast.success(t('roleChanged'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? 'Error');
    } finally {
      setBusy(null);
    }
  };

  const toggleStatus = async (u: AdminUser) => {
    const msg = u.is_active
      ? t('confirmDeactivate', { email: u.email })
      : t('confirmActivate', { email: u.email });
    const ok = await confirm({
      title: t(u.is_active ? 'deactivateTitle' : 'activateTitle'),
      message: msg,
      confirmLabel: tCommon('confirm'),
      cancelLabel: tCommon('cancel'),
      variant: u.is_active ? 'danger' : 'warning',
    });
    if (!ok) return;
    setBusy(u.id);
    try {
      await api.patch(`/admin/users/${u.id}/status`, { is_active: !u.is_active });
      await load();
      toast.success(t(u.is_active ? 'userDeactivated' : 'userActivated'));
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-white text-xs font-medium shadow-2xs"
        >
          <option value="">{t('allRoles')}</option>
          <option value="user">{t('roleUser')}</option>
          <option value="reviewer">{t('roleReviewer')}</option>
          <option value="admin">{t('roleAdmin')}</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-white text-xs font-medium shadow-2xs"
        >
          <option value="">{t('allStatus')}</option>
          <option value="true">{t('statusActive')}</option>
          <option value="false">{t('statusInactive')}</option>
        </select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-full text-xs font-semibold text-[#13426f] border-[#d0d5dd] shadow-xs hover:bg-[#eef6ff]">
          <RefreshCw size={13} className={`mr-1.5 text-[#2e96ff] ${loading ? 'animate-spin' : ''}`} />
          {tCommon('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <Loader2 className="inline animate-spin mr-2 text-[#2e96ff]" size={16} />
          {tCommon('loading')}
        </div>
      ) : (
        <div className="bg-white border border-[#d0d5dd] rounded-[22px] overflow-hidden shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f9f7f0] text-[#13426f] text-xs font-bold uppercase tracking-wider border-b border-[#d0d5dd]">
              <tr>
                <th className="text-left px-4 py-3">{t('emailCol')}</th>
                <th className="text-left px-4 py-3">{t('nameCol')}</th>
                <th className="text-left px-4 py-3">{t('roleCol')}</th>
                <th className="text-left px-4 py-3">{t('provinceCol')}</th>
                <th className="text-left px-4 py-3">{t('statusCol')}</th>
                <th className="text-left px-4 py-3">{t('createdCol')}</th>
                <th className="text-right px-4 py-3">{t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#d0d5dd]/50 hover:bg-[#f9f7f0]/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#13426f] font-medium">{u.email}</td>
                  <td className="px-4 py-3 font-semibold text-[#333333]">{u.full_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={busy === u.id}
                      onChange={(e) => changeRole(u, e.target.value)}
                      className="h-8 px-2.5 rounded-full border border-[#d0d5dd] text-xs bg-white font-medium shadow-2xs"
                    >
                      <option value="user">{t('roleUser')}</option>
                      <option value="reviewer">{t('roleReviewer')}</option>
                      <option value="admin">{t('roleAdmin')}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.province ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                      u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {u.is_active ? t('statusActive') : t('statusInactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-medium">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === u.id}
                      onClick={() => toggleStatus(u)}
                      className={`rounded-full text-xs font-semibold px-3 py-1 shadow-xs ${
                        u.is_active ? 'text-rose-600 border-rose-200 hover:bg-rose-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      {u.is_active ? t('deactivate') : t('activate')}
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── User Policies Tab (buyers list + void) ────────────────────────────────────

interface Buyer {
  user_id: string;
  email: string | null;
  full_name: string | null;
  province: string | null;
  is_active: boolean | null;
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  voided: number;
  active_coverage: number;
  active_premium: number;
}

interface AdminUserPolicy {
  id: string;
  user_id: string;
  policy_number: string;
  policy_type: string;
  plan_name: string;
  coverage_amount: number;
  annual_premium: number;
  status: 'active' | 'expired' | 'cancelled' | 'voided';
  start_date: string;
  end_date: string;
  insured_person?: {
    name: string;
    dob?: string;
    id_number?: string;
    relationship?: string;
  } | null;
  subject_details?: Record<string, any> | null;
  voided_reason: string | null;
  voided_at: string | null;
}

function fmtVNDshort(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

function UserPoliciesTab() {
  const t = useTranslations('admin');
  const tClaims = useTranslations('claims');
  const toast = useToast();

  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Buyer | null>(null);
  const [detail, setDetail] = useState<AdminUserPolicy[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState<AdminUserPolicy | null>(null);
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ buyers: Buyer[] }>('/admin/user-policies');
      setBuyers(r.data.buyers);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBuyers(); }, [loadBuyers]);

  const openDetail = async (b: Buyer) => {
    setSelected(b);
    setDetailLoading(true);
    try {
      const r = await api.get<{ policies: AdminUserPolicy[] }>(`/admin/user-policies/user/${b.user_id}`);
      setDetail(r.data.policies);
    } catch { setDetail([]); } finally { setDetailLoading(false); }
  };

  const doVoid = async () => {
    if (!voidTarget) return;
    if (reason.trim().length < 3) { toast.error(t('voidReasonRequired')); return; }
    setVoiding(true);
    try {
      await api.patch(`/admin/user-policies/${voidTarget.id}/void`, { reason: reason.trim() });
      toast.success(t('voidSuccess'));
      setVoidTarget(null);
      setReason('');
      if (selected) await openDetail(selected);
      await loadBuyers();
    } catch (e: unknown) {
      const detailMsg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detailMsg ?? t('voidFailed'));
    } finally { setVoiding(false); }
  };

  const statusCls: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    expired: 'bg-gray-200 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
    voided: 'bg-purple-100 text-purple-700',
  };

  if (loading) {
    return <div className="text-center py-12"><Loader2 className="inline animate-spin text-blue-600" size={24} /></div>;
  }

  // ── Detail view (one user's policies) ──
  if (selected) {
    return (
      <Section title={`${t('policiesOf')} ${selected.full_name ?? selected.email ?? selected.user_id}`} icon={Wallet}>
        <button onClick={() => setSelected(null)} className="text-sm text-blue-600 hover:underline mb-3">
          ← {t('backToBuyers')}
        </button>
        {detailLoading ? (
          <div className="text-center py-8"><Loader2 className="inline animate-spin text-gray-400" size={20} /></div>
        ) : detail.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">{t('noPoliciesUser')}</p>
        ) : (
          <div className="space-y-2">
            {detail.map((p) => (
              <div key={p.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{p.plan_name}</span>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusCls[p.status]}`}>
                      {t(`status.${p.status}`)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {tClaims(`claimTypes.${p.policy_type}` as never)} · <span className="font-mono">{p.policy_number}</span> · {fmtVNDshort(p.coverage_amount)}
                  </p>
                  {p.insured_person?.name && (
                    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 mt-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      👤 Cho: {p.insured_person.name} ({getRelationshipLabel(p.insured_person.relationship)})
                    </span>
                  )}
                  {p.status === 'voided' && p.voided_reason && (
                    <p className="text-xs text-purple-700 mt-1">⛔ {p.voided_reason}</p>
                  )}
                </div>
                {p.status !== 'voided' && p.status !== 'cancelled' && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { setVoidTarget(p); setReason(''); }}
                    className="shrink-0 text-purple-700 border-purple-200 hover:bg-purple-50 gap-1"
                  >
                    <Ban size={13} /> {t('voidBtn')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {voidTarget && (
          <VoidModal
            policy={voidTarget}
            reason={reason}
            setReason={setReason}
            voiding={voiding}
            onCancel={() => setVoidTarget(null)}
            onConfirm={doVoid}
          />
        )}
      </Section>
    );
  }

  // ── Buyers list ──
  return (
    <Section title={t('userPolicies')} icon={Wallet}>
      <p className="text-xs text-gray-500 mb-3">{t('userPoliciesHint')}</p>
      {buyers.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">{t('noBuyers')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3">{t('buyer')}</th>
                <th className="py-2 px-2 text-center">{t('totalBought')}</th>
                <th className="py-2 px-2 text-center">{t('status.active')}</th>
                <th className="py-2 px-2 text-center">{t('status.voided')}</th>
                <th className="py-2 px-2 text-right">{t('activeCoverage')}</th>
                <th className="py-2 pl-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => (
                <tr key={b.user_id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-gray-900">{b.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{b.email}{b.province ? ` · ${b.province}` : ''}</p>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`font-semibold ${b.total >= 5 ? 'text-orange-600' : 'text-gray-800'}`}>{b.total}</span>
                    {b.total >= 5 && <AlertCircle size={12} className="inline ml-1 text-orange-500" />}
                  </td>
                  <td className="py-2 px-2 text-center text-green-700">{b.active}</td>
                  <td className="py-2 px-2 text-center text-purple-700">{b.voided}</td>
                  <td className="py-2 px-2 text-right text-gray-700">{fmtVNDshort(b.active_coverage)}</td>
                  <td className="py-2 pl-2 text-right">
                    <button onClick={() => openDetail(b)} className="text-xs text-blue-600 hover:underline">
                      {t('viewPolicies')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function VoidModal({
  policy, reason, setReason, voiding, onCancel, onConfirm,
}: {
  policy: AdminUserPolicy;
  reason: string;
  setReason: (v: string) => void;
  voiding: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('admin');
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1 text-purple-700">
          <ShieldOff size={18} />
          <h3 className="font-bold">{t('voidTitle')}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          {policy.plan_name} · <span className="font-mono text-xs">{policy.policy_number}</span>
        </p>
        <Label className="text-xs text-gray-600 mb-1 block">{t('voidReasonLabel')} *</Label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={t('voidReasonPh')}
          className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={voiding}>{t('cancel')}</Button>
          <Button size="sm" onClick={onConfirm} disabled={voiding} className="bg-purple-600 hover:bg-purple-700 gap-1.5">
            {voiding ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
            {t('voidConfirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Policies Tab ─────────────────────────────────────────────────────────────

function PoliciesTab() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const toast = useToast();
  const confirm = useConfirm();
  const [policies, setPolicies] = useState<PolicyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<PolicyDoc[]>('/admin/policies');
      setPolicies(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deletePolicy = async (p: PolicyDoc) => {
    const ok = await confirm({
      title: t('deletePolicyTitle'),
      message: t('deletePolicyMessage', { title: p.title }),
      confirmLabel: tCommon('delete'),
      cancelLabel: tCommon('cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/policies/${p.id}`);
      toast.success(t('policyDeleted'));
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Error');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{t('qdrantHint')}</p>
        <Button onClick={() => setShowUpload(true)}>
          <Upload size={14} className="mr-2" />
          {t('uploadPolicy')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="inline animate-spin" /></div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-gray-400">{t('noPoliciesYet')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {policies.map((p) => (
            <div key={p.id} className="border rounded-xl p-4 bg-white">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-xs text-gray-500">
                    {p.category} · v{p.version}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                }`}>
                  {p.is_active ? t('statusActive') : t('statusInactive')}
                </span>
              </div>
              <p className="text-sm text-gray-600 line-clamp-2 mb-3">{p.content_preview}</p>
              <div className="flex justify-between items-center text-xs">
                <div className="text-gray-500">
                  <span className="font-semibold text-blue-600">{p.chunk_count}</span> {t('chunkCount').toLowerCase()}
                  {p.last_ingested && <span className="ml-2">· {new Date(p.last_ingested).toLocaleDateString()}</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => deletePolicy(p)} className="text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <PolicyUploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); load(); }}
        />
      )}
    </div>
  );
}

function PolicyUploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [form, setForm] = useState({
    title: '', category: 'health', version: '1.0', content: '', coverage_types: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (form.title.trim().length < 3) { setError(t('policyTitle')); return; }
    if (form.content.trim().length < 100) { setError(tCommon('error')); return; }
    setSubmitting(true);
    try {
      await api.post('/admin/policies', {
        title: form.title,
        category: form.category,
        version: form.version,
        content: form.content,
        coverage_types: form.coverage_types.split(',').map(s => s.trim()).filter(Boolean),
      });
      alert(t('uploadSuccess'));
      onSuccess();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{t('uploadPolicy')}</h3>
        <div className="space-y-3">
          <div>
            <Label>{t('policyTitle')}</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('policyCategory')}</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-10 px-3 rounded-md border bg-white text-sm w-full"
              >
                <option value="health">health</option>
                <option value="life">life</option>
                <option value="property">property</option>
                <option value="vehicle">vehicle</option>
                <option value="disaster">disaster</option>
                <option value="income">income</option>
              </select>
            </div>
            <div>
              <Label>{t('policyVersion')}</Label>
              <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t('policyCoverageTypes')}</Label>
            <Input
              placeholder="health, disaster, ..."
              value={form.coverage_types}
              onChange={(e) => setForm({ ...form, coverage_types: e.target.value })}
            />
          </div>
          <div>
            <Label>{t('policyContent')}</Label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full h-48 px-3 py-2 rounded-md border text-sm font-mono"
              placeholder="# Policy Title&#10;&#10;## Coverage&#10;..."
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>{tCommon('cancel')}</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin mr-2" size={14} />}
            {tCommon('upload')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Audit Logs Tab ───────────────────────────────────────────────────────────

function AuditLogsTab() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [fromDate, setFromDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '100' };
      if (action) params.action = action;
      if (targetType) params.target_type = targetType;
      if (fromDate) params.from_date = fromDate;
      const r = await api.get<{ items: AuditLogItem[] }>('/admin/audit-logs', { params });
      setLogs(r.data.items);
    } finally {
      setLoading(false);
    }
  }, [action, targetType, fromDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 px-3 rounded-md border bg-white text-sm">
          <option value="">{t('allActions')}</option>
          <option value="role_change">role_change</option>
          <option value="user_activate">user_activate</option>
          <option value="user_deactivate">user_deactivate</option>
          <option value="policy_upload">policy_upload</option>
          <option value="policy_delete">policy_delete</option>
          <option value="claim_override">claim_override</option>
        </select>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="h-9 px-3 rounded-md border bg-white text-sm">
          <option value="">{t('allTargets')}</option>
          <option value="user">user</option>
          <option value="policy">policy</option>
          <option value="claim">claim</option>
        </select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-40"
        />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> {tCommon('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="inline animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center text-gray-400 py-12">{t('noLogs')}</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">{t('timeCol')}</th>
                <th className="text-left px-4 py-2">{t('actorCol')}</th>
                <th className="text-left px-4 py-2">{t('actionCol')}</th>
                <th className="text-left px-4 py-2">{t('targetCol')}</th>
                <th className="text-left px-4 py-2">{t('detailsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(l.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{l.actor_email}</td>
                  <td className="px-4 py-2">
                    <code className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {l.action}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {l.target_type}/{l.target_id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-md truncate">
                    {Object.entries(l.details).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── System Health Tab ────────────────────────────────────────────────────────

function SystemHealthTab() {
  const t = useTranslations('admin');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<SystemHealth>('/admin/system/health');
      setHealth(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const services = useMemo(() => (
    health ? Object.entries(health.services) : []
  ), [health]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          {health && (
            <>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                health.overall === 'up'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {t('overallHealth')}: {health.overall}
              </span>
              <span className="text-xs text-gray-500">
                {t('lastCheck')}: {new Date(health.checked_at).toLocaleTimeString()}
              </span>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('checkNow')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {services.map(([name, svc]) => (
          <div key={name} className="border rounded-xl p-4 bg-white">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold capitalize">{name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                svc.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {svc.status === 'up' ? t('serviceUp') : t('serviceDown')}
              </span>
            </div>
            {svc.latency_ms !== undefined && (
              <p className="text-xs text-gray-500">{t('latency')}: {svc.latency_ms}ms</p>
            )}
            {svc.workers && svc.workers.length > 0 && (
              <p className="text-xs text-gray-500">Workers: {svc.workers.length}</p>
            )}
            {svc.collections && (
              <p className="text-xs text-gray-500">Collections: {svc.collections.join(', ') || '—'}</p>
            )}
            {svc.error && (
              <p className="text-xs text-red-600 mt-2 font-mono">{svc.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: 'green' | 'red' | 'blue' }) {
  const color = accent === 'green' ? 'text-emerald-600'
    : accent === 'red' ? 'text-rose-600'
    : 'text-[#2e96ff]';
  return (
    <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1 font-medium">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
      <h3 className="font-bold text-base text-[#13426f] mb-4 flex items-center gap-2">
        <Icon size={18} className="text-[#2e96ff]" /> {title}
      </h3>
      {children}
    </div>
  );
}
