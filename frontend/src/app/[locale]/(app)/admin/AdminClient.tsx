'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertCircle, BarChart3, FileText, Heart,
  Loader2, RefreshCw, ScrollText, Shield, Trash2, Upload, Users as UsersIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import type { User } from '@/types';

type TabKey = 'users' | 'analytics' | 'policies' | 'auditLogs' | 'systemHealth';

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

interface FullAnalytics {
  users: { total: number; active: number; reviewers: number };
  claims: {
    total: number; approved: number; rejected: number; manual_review: number;
    processing: number; approval_rate: number; fraud_rate: number;
  };
  top_high_risk_provinces: Array<{ name: string; region: string; risk_score: number }>;
  reviewer_performance: Array<{
    reviewer_id: string; email: string; full_name: string | null;
    total_reviewed: number; approved: number; approval_rate: number;
  }>;
  daily_claims: Array<{ date: string; count: number }>;
  region_breakdown: Record<string, number>;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function AdminClient() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();

  const [tab, setTab] = useState<TabKey>('users');
  const [authChecking, setAuthChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

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
    { key: 'analytics', label: t('analytics'), icon: BarChart3 },
    { key: 'policies', label: t('policies'), icon: FileText },
    { key: 'auditLogs', label: t('auditLogs'), icon: ScrollText },
    { key: 'systemHealth', label: t('systemHealth'), icon: Activity },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Shield size={22} className="text-blue-600" /> {t('title')}
      </h1>

      <div className="border-b border-gray-200 mb-6 flex gap-1 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'analytics' && <AnalyticsTab />}
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
          className="h-9 px-3 rounded-md border bg-white text-sm"
        >
          <option value="">{t('allRoles')}</option>
          <option value="user">{t('roleUser')}</option>
          <option value="reviewer">{t('roleReviewer')}</option>
          <option value="admin">{t('roleAdmin')}</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="h-9 px-3 rounded-md border bg-white text-sm"
        >
          <option value="">{t('allStatus')}</option>
          <option value="true">{t('statusActive')}</option>
          <option value="false">{t('statusInactive')}</option>
        </select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
          {tCommon('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <Loader2 className="inline animate-spin mr-2" size={16} />
          {tCommon('loading')}
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">{t('emailCol')}</th>
                <th className="text-left px-4 py-2">{t('nameCol')}</th>
                <th className="text-left px-4 py-2">{t('roleCol')}</th>
                <th className="text-left px-4 py-2">{t('provinceCol')}</th>
                <th className="text-left px-4 py-2">{t('statusCol')}</th>
                <th className="text-left px-4 py-2">{t('createdCol')}</th>
                <th className="text-right px-4 py-2">{t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-2">{u.full_name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      disabled={busy === u.id}
                      onChange={(e) => changeRole(u, e.target.value)}
                      className="h-8 px-2 rounded border text-xs bg-white"
                    >
                      <option value="user">{t('roleUser')}</option>
                      <option value="reviewer">{t('roleReviewer')}</option>
                      <option value="admin">{t('roleAdmin')}</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{u.province ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {u.is_active ? t('statusActive') : t('statusInactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === u.id}
                      onClick={() => toggleStatus(u)}
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

// ── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [data, setData] = useState<FullAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<FullAnalytics>('/admin/analytics/full');
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-12"><Loader2 className="inline animate-spin" /></div>;
  if (!data) return <div className="text-center text-gray-400 py-12">{tCommon('error')}</div>;

  const maxDaily = Math.max(1, ...data.daily_claims.map(d => d.count));
  const totalRegion = Object.values(data.region_breakdown).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t('totalUsers')} value={data.users.total} sub={`${data.users.active} ${t('activeUsers').toLowerCase()}`} />
        <MetricCard label={t('totalClaims')} value={data.claims.total} sub={`${data.claims.approved} approved`} />
        <MetricCard label={t('approvalRate')} value={`${data.claims.approval_rate}%`} accent="green" />
        <MetricCard label={t('fraudRate')} value={`${data.claims.fraud_rate}%`} accent="red" />
      </div>

      {/* Daily chart */}
      <Section title={t('analytics')} icon={BarChart3}>
        <div className="flex items-end gap-1 h-32">
          {data.daily_claims.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end group">
              <div
                className="w-full bg-blue-500 hover:bg-blue-600 rounded-t transition-colors"
                style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? '2px' : '0' }}
                title={`${d.date}: ${d.count}`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{data.daily_claims[0]?.date}</span>
          <span>{data.daily_claims.at(-1)?.date}</span>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Region breakdown */}
        <Section title={t('regionBreakdown')} icon={Heart}>
          <div className="space-y-2">
            {Object.entries(data.region_breakdown).map(([region, count]) => (
              <div key={region} className="flex items-center gap-3">
                <span className="text-sm w-20 capitalize">{region}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${(count / totalRegion) * 100}%` }} />
                </div>
                <span className="text-sm w-12 text-right text-gray-600">{count}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Top risk provinces */}
        <Section title={t('topRiskProvinces')} icon={AlertCircle}>
          <ul className="space-y-2">
            {data.top_high_risk_provinces.map((p) => (
              <li key={p.name} className="flex items-center justify-between text-sm">
                <span>{p.name}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-700 font-semibold">
                  {p.risk_score}/100
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Reviewer performance */}
      <Section title={t('reviewerPerf')} icon={UsersIcon}>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b">
            <tr>
              <th className="text-left py-2">{t('emailCol')}</th>
              <th className="text-right py-2">{t('totalReviewed')}</th>
              <th className="text-right py-2">{t('approvedCol')}</th>
              <th className="text-right py-2">{t('approvalRate')}</th>
            </tr>
          </thead>
          <tbody>
            {data.reviewer_performance.map((r) => (
              <tr key={r.reviewer_id} className="border-b last:border-0">
                <td className="py-2 font-mono text-xs">{r.email}</td>
                <td className="py-2 text-right">{r.total_reviewed}</td>
                <td className="py-2 text-right">{r.approved}</td>
                <td className="py-2 text-right font-semibold text-green-600">{r.approval_rate}%</td>
              </tr>
            ))}
            {data.reviewer_performance.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-gray-400">—</td></tr>
            )}
          </tbody>
        </table>
      </Section>
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
  const color = accent === 'green' ? 'text-green-600'
    : accent === 'red' ? 'text-red-600'
    : 'text-blue-600';
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Icon size={16} className="text-blue-600" /> {title}
      </h3>
      {children}
    </div>
  );
}
