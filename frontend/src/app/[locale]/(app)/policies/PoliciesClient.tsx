'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, ArrowRight, Briefcase, Calendar, Car, CheckCircle,
  ClipboardList, Clock, CreditCard, Download, ExternalLink, FileText, Heart, Home, Info,
  Loader2, Mail, MapPin, Receipt, RefreshCw, Shield, ShieldCheck, Trash2, User as UserIcon, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PolicyTermsModal } from '@/components/policies/PolicyTermsModal';
import api from '@/lib/api';
import type { Claim, PaymentSummary, PolicyPayment, User, UserPolicy } from '@/types';

type PolicyType = 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';
type TabKey = 'mine' | 'history' | 'browse';

interface PlanOption {
  plan_name: string;
  description?: string;
  coverage_amount: number;
  annual_premium: number;
}
type PlansData = Record<PolicyType, PlanOption[]>;

const POLICY_TYPES: PolicyType[] = ['health', 'life', 'property', 'vehicle', 'disaster', 'income'];

const TYPE_ICONS: Record<PolicyType, typeof Heart> = {
  health: Heart,
  life: ShieldCheck,
  property: Home,
  vehicle: Car,
  disaster: AlertTriangle,
  income: Wallet,
};

const TYPE_COLORS: Record<PolicyType, string> = {
  health: 'from-rose-500 to-red-600',
  life: 'from-blue-500 to-indigo-600',
  property: 'from-emerald-500 to-green-600',
  vehicle: 'from-amber-500 to-orange-600',
  disaster: 'from-orange-500 to-red-600',
  income: 'from-violet-500 to-purple-600',
};

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
  }).format(n);
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Main component ───────────────────────────────────────────────────────────

export function PoliciesClient() {
  const t = useTranslations('policies');
  const locale = useLocale();

  const [tab, setTab] = useState<TabKey>('mine');
  const [policies, setPolicies] = useState<UserPolicy[]>([]);
  const [plans, setPlans] = useState<PlansData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<UserPolicy | null>(null);
  const [termsCategory, setTermsCategory] = useState<PolicyType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pl, plansR, meR] = await Promise.allSettled([
        api.get<UserPolicy[]>('/policies'),
        api.get<PlansData>('/policies/plans'),
        api.get<User>('/auth/me'),
      ]);
      if (pl.status === 'fulfilled') setPolicies(pl.value.data);
      if (plansR.status === 'fulfilled') setPlans(plansR.value.data);
      if (meR.status === 'fulfilled') setMe(meR.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ownedActiveTypes = useMemo(
    () => new Set(policies.filter((p) => p.status === 'active').map((p) => p.policy_type)),
    [policies]
  );

  const stats = useMemo(() => {
    const active = policies.filter((p) => p.status === 'active');
    return {
      total: active.length,
      coverage: active.reduce((sum, p) => sum + p.coverage_amount, 0),
      premium: active.reduce((sum, p) => sum + p.annual_premium, 0),
    };
  }, [policies]);

  const activeCount = useMemo(() => policies.filter((p) => p.status === 'active').length, [policies]);
  const historyCount = useMemo(() => policies.filter((p) => p.status !== 'active').length, [policies]);

  // Auto-redirect away from history tab if it becomes empty (e.g. after page reload with no history)
  useEffect(() => {
    if (tab === 'history' && historyCount === 0) setTab('mine');
  }, [tab, historyCount]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield size={22} className="text-blue-600" /> {t('title')}
        </h1>
        <Link
          href={`/${locale}/claims`}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <ClipboardList size={14} /> {t('viewClaims')}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label={t('totalPolicies')} value={stats.total} icon={Shield} />
        <StatCard label={t('totalCoverage')} value={fmtVND(stats.coverage)} icon={CheckCircle} accent="green" />
        <StatCard label={t('totalPremium')} value={fmtVND(stats.premium)} icon={Wallet} accent="orange" />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-1">
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} icon={Briefcase}>
          {t('tabMine')} ({activeCount})
        </TabBtn>
        {historyCount > 0 && (
          <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={Clock}>
            {t('tabHistory')} ({historyCount})
          </TabBtn>
        )}
        <TabBtn active={tab === 'browse'} onClick={() => setTab('browse')} icon={Info}>
          {t('tabBrowseRef')}
        </TabBtn>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="inline animate-spin text-blue-600" size={24} />
        </div>
      ) : tab === 'mine' ? (
        <MinePolicies policies={policies} onSelect={setSelectedPolicy} />
      ) : tab === 'history' ? (
        <HistoryPolicies policies={policies} onSelect={setSelectedPolicy} />
      ) : (
        <BrowseReferencePlans
          plans={plans}
          ownedTypes={ownedActiveTypes}
          onViewTerms={setTermsCategory}
        />
      )}

      {selectedPolicy && (
        <PolicyDetailModal
          policy={selectedPolicy}
          buyer={me}
          onClose={() => setSelectedPolicy(null)}
          onChanged={() => { setSelectedPolicy(null); load(); }}
          onViewTerms={() => setTermsCategory(selectedPolicy.policy_type as PolicyType)}
        />
      )}

      {termsCategory && (
        <PolicyTermsModal
          category={termsCategory}
          onClose={() => setTermsCategory(null)}
          // Stack above PolicyDetailModal when both open
          zIndexClass={selectedPolicy ? 'z-[60]' : 'z-50'}
        />
      )}
    </div>
  );
}

// ── Mine policies ────────────────────────────────────────────────────────────

function MinePolicies({
  policies, onSelect,
}: {
  policies: UserPolicy[];
  onSelect: (p: UserPolicy) => void;
}) {
  const t = useTranslations('policies');
  const locale = useLocale();
  const active = useMemo(() => policies.filter((p) => p.status === 'active'), [policies]);

  if (active.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-12 text-center">
        <Shield size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">
          {policies.length === 0 ? t('noPolicies') : t('noActivePolicies')}
        </p>
        <Link
          href={`/${locale}/documents`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <FileText size={14} /> {t('goToDocuments')} <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {active.map((p) => (
        <PolicyRow key={p.id} policy={p} onClick={() => onSelect(p)} />
      ))}
    </div>
  );
}

// ── History policies (separate tab — cancelled / expired) ────────────────────

function HistoryPolicies({
  policies, onSelect,
}: {
  policies: UserPolicy[];
  onSelect: (p: UserPolicy) => void;
}) {
  const t = useTranslations('policies');
  const history = useMemo(() => policies.filter((p) => p.status !== 'active'), [policies]);
  const cancelled = useMemo(() => history.filter((p) => p.status === 'cancelled'), [history]);
  const expired = useMemo(() => history.filter((p) => p.status === 'expired'), [history]);

  if (history.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-12 text-center">
        <Clock size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{t('historyEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">{t('historyHint')}</p>

      {cancelled.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {t('cancelled')}
            </h2>
            <span className="text-xs text-gray-400">({cancelled.length})</span>
          </div>
          <div className="flex flex-col gap-2">
            {cancelled.map((p) => (
              <div key={p.id} className="opacity-80 hover:opacity-100 transition-opacity">
                <PolicyRow policy={p} onClick={() => onSelect(p)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {expired.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {t('expired')}
            </h2>
            <span className="text-xs text-gray-400">({expired.length})</span>
          </div>
          <div className="flex flex-col gap-2">
            {expired.map((p) => (
              <div key={p.id} className="opacity-80 hover:opacity-100 transition-opacity">
                <PolicyRow policy={p} onClick={() => onSelect(p)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Horizontal row card (used in both active + history) ────────────────────

function PolicyRow({ policy, onClick }: { policy: UserPolicy; onClick: () => void }) {
  const t = useTranslations('policies');
  const tClaims = useTranslations('claims');

  const Icon = TYPE_ICONS[policy.policy_type as PolicyType] ?? Shield;
  const gradient = TYPE_COLORS[policy.policy_type as PolicyType] ?? 'from-gray-500 to-gray-700';

  const isActive = policy.status === 'active';
  const isCancelled = policy.status === 'cancelled';
  const startDate = new Date(policy.start_date);
  const endDate = new Date(policy.end_date);
  const daysLeft = isActive ? daysBetween(new Date(), endDate) : null;

  const statusCls: Record<string, string> = {
    active:    'bg-green-100 text-green-700 border-green-200',
    expired:   'bg-gray-200 text-gray-600 border-gray-300',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
  };
  const statusLabel: Record<string, string> = {
    active: t('active'), expired: t('expired'), cancelled: t('cancelled'),
  };

  // Days-left chip color (only for active)
  const daysChipCls = daysLeft == null ? ''
    : daysLeft < 30 ? 'bg-orange-100 text-orange-700 border-orange-200'
    : daysLeft < 90 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left bg-white border rounded-xl overflow-hidden hover:shadow-md hover:border-blue-300 transition-all flex items-stretch"
    >
      {/* Left: gradient icon block (wider for active) */}
      <div className={`bg-gradient-to-br ${gradient} text-white flex flex-col items-center justify-center px-4 shrink-0 ${isActive ? 'w-24' : 'w-20'}`}>
        <Icon size={isActive ? 28 : 24} />
        {isActive && <p className="text-[9px] text-white/80 uppercase tracking-wider mt-1">{t('active')}</p>}
      </div>

      {/* Middle: name + meta */}
      <div className="flex-1 min-w-0 px-4 py-3">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className={`font-semibold text-sm truncate ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
            {policy.plan_name}
          </h3>
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${statusCls[policy.status] ?? statusCls.active}`}>
            {statusLabel[policy.status] ?? policy.status}
          </span>
          {daysLeft != null && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${daysChipCls}`}>
              {daysLeft > 0 ? t('expiresInDays', { days: daysLeft }) : t('expired7d')}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {tClaims(`claimTypes.${policy.policy_type}` as never)} · <span className="font-mono">{policy.policy_number}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {startDate.toLocaleDateString()} — {endDate.toLocaleDateString()}
        </p>
      </div>

      {/* Right: coverage + premium + chevron */}
      <div className="px-4 py-3 flex flex-col items-end justify-center border-l shrink-0 min-w-[160px]">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('coverage')}</p>
        <p className={`text-sm font-bold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
          {fmtVND(policy.coverage_amount)}
        </p>
        {isActive && (
          <p className="text-[10px] text-gray-500 mt-0.5">
            {t('premium')}: <span className="font-medium text-gray-700">{fmtVND(policy.annual_premium)}/{t('yearShort')}</span>
          </p>
        )}
        <div className={`text-xs font-medium flex items-center gap-1 mt-1.5 group-hover:gap-2 transition-all ${isCancelled ? 'text-gray-500' : 'text-blue-600'}`}>
          {t('viewDetails')} <ArrowRight size={11} />
        </div>
      </div>
    </button>
  );
}

// ── Policy Detail Modal ──────────────────────────────────────────────────────

function PolicyDetailModal({
  policy, buyer, onClose, onChanged, onViewTerms,
}: {
  policy: UserPolicy;
  buyer: User | null;
  onClose: () => void;
  onChanged: () => void;
  onViewTerms: () => void;
}) {
  const t = useTranslations('policies');
  const tClaims = useTranslations('claims');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const [related, setRelated] = useState<Claim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const renewPolicy = async () => {
    setRenewing(true);
    try {
      await api.post(`/policies/${policy.id}/renew`);
      toast.success(t('renewSuccess'));
      onChanged();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('renewFailed'));
    } finally {
      setRenewing(false);
    }
  };

  const downloadContract = async () => {
    setDownloadingPdf(true);
    try {
      const res = await api.get<Blob>(`/policies/${policy.id}/contract.pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hop-dong-${policy.policy_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('downloadContractFailed'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const Icon = TYPE_ICONS[policy.policy_type as PolicyType] ?? Shield;
  const gradient = TYPE_COLORS[policy.policy_type as PolicyType] ?? 'from-gray-500 to-gray-700';
  const isActive = policy.status === 'active';

  const startDate = new Date(policy.start_date);
  const endDate = new Date(policy.end_date);
  const daysLeft = isActive ? daysBetween(new Date(), endDate) : null;
  const totalDays = daysBetween(startDate, endDate);
  const progressPct = isActive && totalDays > 0
    ? Math.min(100, Math.max(0, ((totalDays - (daysLeft ?? 0)) / totalDays) * 100))
    : 0;

  // Tạm thời filter claims theo claim_type (chưa có policy_id field) — đợi TASK-027
  useEffect(() => {
    let mounted = true;
    api.get<Claim[]>('/claims')
      .then((r) => {
        if (!mounted) return;
        setRelated(r.data.filter((c) => c.claim_type === policy.policy_type));
      })
      .catch(() => {})
      .finally(() => mounted && setLoadingClaims(false));
    return () => { mounted = false; };
  }, [policy.policy_type]);

  // Tính coverage còn lại từ claims đã approved
  const usedCoverage = related
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + (c.amount_approved ?? 0), 0);
  const remainingCoverage = Math.max(0, policy.coverage_amount - usedCoverage);

  const cancelPolicy = async () => {
    const ok = await confirm({
      title: t('cancelTitle'),
      message: t('cancelConfirm', { plan: policy.plan_name }),
      confirmLabel: t('cancelBtn'),
      cancelLabel: tc('cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await api.delete(`/policies/${policy.id}`);
      toast.success(t('cancelSuccess'));
      onChanged();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-br ${gradient} p-6 text-white relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X size={16} />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <Icon size={26} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/80">
                {tClaims(`claimTypes.${policy.policy_type}` as never)}
              </p>
              <h2 className="text-xl font-bold mt-1">{policy.plan_name}</h2>
              <p className="text-xs font-mono text-white/80 mt-2">
                {t('policyNumber')}: {policy.policy_number}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Expiry / renew banner */}
          {(policy.status === 'expired' || (isActive && daysLeft != null && daysLeft < 30)) && (
            <div className={`rounded-xl border p-4 flex items-start gap-3 ${
              policy.status === 'expired'
                ? 'bg-red-50 border-red-200'
                : 'bg-orange-50 border-orange-200'
            }`}>
              <AlertTriangle size={18} className={policy.status === 'expired' ? 'text-red-500 mt-0.5' : 'text-orange-500 mt-0.5'} />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${policy.status === 'expired' ? 'text-red-700' : 'text-orange-700'}`}>
                  {policy.status === 'expired' ? t('expiredBanner') : t('expiringBanner', { days: daysLeft ?? 0 })}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{t('renewHint')}</p>
              </div>
              {policy.status !== 'cancelled' && (
                <Button size="sm" onClick={renewPolicy} disabled={renewing} className="shrink-0 gap-1.5">
                  {renewing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {t('renewBtn')}
                </Button>
              )}
            </div>
          )}

          {policy.description && (
            <p className="text-sm text-gray-600 italic">{policy.description}</p>
          )}

          {/* Buyer info — người đăng ký */}
          {buyer && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UserIcon size={14} className="text-blue-600" /> {t('buyerInfo')}
              </h3>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <UserIcon size={13} className="text-blue-500" />
                  <span className="text-gray-500">{t('buyerName')}:</span>
                  <span className="font-medium text-gray-900">{buyer.full_name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={13} className="text-blue-500" />
                  <span className="text-gray-500">{t('buyerEmail')}:</span>
                  <span className="font-mono text-gray-700 text-xs">{buyer.email}</span>
                </div>
                {buyer.province && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={13} className="text-blue-500" />
                    <span className="text-gray-500">{t('buyerProvince')}:</span>
                    <span className="text-gray-900">{buyer.province}</span>
                  </div>
                )}
                <p className="text-[11px] text-gray-500 pt-2 mt-2 border-t border-blue-100">
                  {t('buyerNote')}
                </p>
              </div>
            </section>
          )}

          {/* Coverage breakdown */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Shield size={14} className="text-blue-600" /> {t('coverageBreakdown')}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <BreakdownCard
                label={t('coverage')}
                value={fmtVND(policy.coverage_amount)}
                accent="blue"
              />
              <BreakdownCard
                label={t('coverageUsed')}
                value={fmtVND(usedCoverage)}
                accent="orange"
              />
              <BreakdownCard
                label={t('coverageRemaining')}
                value={fmtVND(remainingCoverage)}
                accent="green"
              />
            </div>
          </section>

          {/* Timeline */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar size={14} className="text-blue-600" /> {t('policyPeriod')}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('startDate')}</span>
                <span className="font-medium">{startDate.toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('endDate')}</span>
                <span className="font-medium">{endDate.toLocaleDateString()}</span>
              </div>
              {isActive && daysLeft != null && (
                <>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className={`text-xs font-medium ${
                    daysLeft < 30 ? 'text-orange-600' : daysLeft < 90 ? 'text-amber-600' : 'text-gray-600'
                  }`}>
                    {daysLeft > 0 ? t('expiresInDays', { days: daysLeft }) : t('expired7d')}
                  </p>
                </>
              )}
            </div>
          </section>

          {/* Premium */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Wallet size={14} className="text-blue-600" /> {t('premium')}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <Row label={t('insurer')} value={policy.insurer} />
              <Row label={t('annualPremium')} value={fmtVND(policy.annual_premium)} bold />
            </div>
          </section>

          {/* Payment schedule (A2) */}
          <PaymentSchedule policyId={policy.id} />

          {/* Related claims */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ClipboardList size={14} className="text-blue-600" /> {t('relatedClaims')}
            </h3>
            {loadingClaims ? (
              <div className="text-center py-4">
                <Loader2 className="inline animate-spin text-gray-400" size={16} />
              </div>
            ) : related.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                {t('noClaimsForPolicy')}
              </p>
            ) : (
              <ul className="space-y-2">
                {related.slice(0, 5).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-mono text-xs text-gray-500">
                        #{c.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="ml-2 text-gray-700">
                        {fmtVND(c.amount_claimed)}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      c.status === 'approved' ? 'bg-green-100 text-green-700'
                      : c.status === 'rejected' ? 'bg-red-100 text-red-700'
                      : c.status === 'manual_review' ? 'bg-orange-100 text-orange-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {tClaims(`status.${c.status}` as never)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {related.length > 0 && (
              <Link
                href={`/${locale}/claims`}
                className="text-xs text-blue-600 hover:underline mt-2 inline-flex items-center gap-1"
              >
                {t('viewAllClaims')} <ArrowRight size={11} />
              </Link>
            )}
          </section>
        </div>

        {/* Footer actions */}
        <div className="border-t bg-gray-50 px-6 py-4 flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewTerms}
            className="text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            <Info size={14} className="mr-2" /> {t('viewTerms')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadContract}
            disabled={downloadingPdf}
            title={t('downloadContractHint')}
            className="text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            {downloadingPdf
              ? <Loader2 size={14} className="mr-2 animate-spin" />
              : <Download size={14} className="mr-2" />}
            {downloadingPdf ? t('downloadingContract') : t('downloadContract')}
          </Button>
          <Link
            href={`/${locale}/claims`}
            className="inline-flex items-center px-3 py-1.5 rounded-md border bg-white text-sm hover:bg-gray-100"
          >
            <ExternalLink size={14} className="mr-2" /> {t('viewClaims')}
          </Link>
          {policy.status !== 'cancelled' && (
            <Button
              variant="outline"
              size="sm"
              onClick={renewPolicy}
              disabled={renewing}
              className="text-emerald-700 hover:bg-emerald-50 border-emerald-200"
            >
              {renewing ? <Loader2 className="animate-spin mr-2" size={14} /> : <RefreshCw size={14} className="mr-2" />}
              {t('renewBtn')}
            </Button>
          )}
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancelPolicy}
              disabled={cancelling}
              className="text-red-600 hover:bg-red-50 border-red-200"
            >
              {cancelling ? <Loader2 className="animate-spin mr-2" size={14} /> : <Trash2 size={14} className="mr-2" />}
              {t('cancelBtn')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Payment schedule (A2) ─────────────────────────────────────────────────────

function PaymentSchedule({ policyId }: { policyId: string }) {
  const t = useTranslations('policies');
  const toast = useToast();
  const [items, setItems] = useState<PolicyPayment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ items: PolicyPayment[]; summary: PaymentSummary }>(
        `/policies/${policyId}/payments`,
      );
      setItems(r.data.items);
      setSummary(r.data.summary);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [policyId]);

  useEffect(() => { load(); }, [load]);

  const pay = async (p: PolicyPayment) => {
    setPayingId(p.id);
    try {
      await api.post(`/policies/${policyId}/payments/${p.id}/pay`);
      toast.success(t('paySuccess'));
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('payFailed'));
    } finally { setPayingId(null); }
  };

  const receipt = async (p: PolicyPayment) => {
    try {
      const res = await api.get<Blob>(`/policies/${policyId}/payments/${p.id}/receipt.pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bien-lai-ky${p.installment_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error(t('payFailed')); }
  };

  if (loading) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CreditCard size={14} className="text-blue-600" /> {t('paymentSchedule')}
        </h3>
        <div className="text-center py-4"><Loader2 className="inline animate-spin text-gray-400" size={16} /></div>
      </section>
    );
  }
  if (!summary || items.length === 0) return null;

  const freqLabel = summary.frequency === 'yearly' ? t('freqYearly')
    : summary.frequency === 'quarterly' ? t('freqQuarterly') : t('freqMonthly');

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <CreditCard size={14} className="text-blue-600" /> {t('paymentSchedule')}
        <span className="text-xs font-normal text-gray-400">· {freqLabel}</span>
      </h3>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <BreakdownCard label={t('paidLabel')} value={`${summary.paid_count}/${summary.total_installments}`} accent="green" />
        <BreakdownCard label={t('paymentPaidAmount')} value={fmtVND(summary.paid_amount)} accent="blue" />
        <BreakdownCard label={t('paymentRemaining')} value={fmtVND(summary.remaining_amount)} accent="orange" />
      </div>

      <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
        {items.map((p) => {
          const due = new Date(p.due_date);
          const isPaid = p.status === 'paid';
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-gray-800">
                  {t('installment')} {p.installment_no}/{p.total_installments}
                  <span className="text-gray-400 font-normal"> · {t('due')} {due.toLocaleDateString()}</span>
                </p>
                <p className="text-xs text-gray-500">{fmtVND(p.amount)}</p>
              </div>
              {isPaid ? (
                <button
                  onClick={() => receipt(p)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100"
                >
                  <Receipt size={12} /> {t('receipt')}
                </button>
              ) : (
                <Button size="sm" onClick={() => pay(p)} disabled={payingId === p.id} className="shrink-0 gap-1 h-7 text-xs">
                  {payingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                  {t('payNow')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Browse reference plans (no buy) ───────────────────────────────────────────

function BrowseReferencePlans({
  plans, ownedTypes, onViewTerms,
}: {
  plans: PlansData | null;
  ownedTypes: Set<string>;
  onViewTerms: (cat: PolicyType) => void;
}) {
  const t = useTranslations('policies');
  const tClaims = useTranslations('claims');
  const locale = useLocale();
  const [selectedType, setSelectedType] = useState<PolicyType>('health');

  if (!plans) {
    return <div className="text-center py-12"><Loader2 className="inline animate-spin" /></div>;
  }

  const typePlans = plans[selectedType] ?? [];

  return (
    <div className="space-y-6">
      {/* CTA Banner */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
          <FileText size={18} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{t('purchaseFlowTitle')}</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{t('purchaseFlowHint')}</p>
        </div>
        <Link
          href={`/${locale}/documents`}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          {t('goToDocuments')} <ArrowRight size={14} />
        </Link>
      </div>

      {/* Type selector */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">{t('selectType')}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {POLICY_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type];
            const isSelected = selectedType === type;
            const owned = ownedTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-200'
                }`}
              >
                {owned && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                    <CheckCircle size={10} />
                  </span>
                )}
                <Icon size={20} className={isSelected ? 'text-blue-600' : 'text-gray-500'} />
                <span className={`text-xs font-medium text-center leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                  {tClaims(`claimTypes.${type}` as never)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plans (read-only catalog) */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-900">
            {tClaims(`claimTypes.${selectedType}` as never)}
          </h2>
          {ownedTypes.has(selectedType) && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex items-center gap-1">
              <AlertTriangle size={11} /> {t('alreadyOwned')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {typePlans.map((plan, idx) => {
            const gradient = TYPE_COLORS[selectedType];
            const isPopular = idx === 1;
            return (
              <div
                key={idx}
                className={`relative bg-white border rounded-xl overflow-hidden flex flex-col ${
                  isPopular ? 'border-blue-400 shadow-md' : ''
                }`}
              >
                {isPopular && (
                  <div className="absolute top-3 right-3">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      ★ {t('popularBadge')}
                    </span>
                  </div>
                )}
                <div className={`h-2 bg-gradient-to-r ${gradient}`} />

                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-lg">{plan.plan_name}</h3>
                  {plan.description && (
                    <p className="text-xs text-gray-500 mt-1 mb-4 leading-relaxed">{plan.description}</p>
                  )}

                  <div className="mt-auto space-y-2 mb-4">
                    <div className="text-xs text-gray-500">{t('coverage')}</div>
                    <div className="text-xl font-bold text-gray-900">{fmtVND(plan.coverage_amount)}</div>
                    <div className="border-t pt-2">
                      <span className="text-xs text-gray-500">{t('premium')}: </span>
                      <span className="font-semibold text-blue-700">{fmtVND(plan.annual_premium)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => onViewTerms(selectedType)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
                    >
                      <Info size={14} /> {t('viewTerms')}
                    </button>
                    <Link
                      href={`/${locale}/documents`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                      <FileText size={14} /> {t('registerFromDocs')} <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// PolicyTermsModal extracted to '@/components/policies/PolicyTermsModal'

// ── Sub-components ───────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: typeof Heart; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  );
}

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: string | number; icon: typeof Heart;
  accent?: 'green' | 'orange';
}) {
  const color = accent === 'green' ? 'text-green-600 bg-green-50'
    : accent === 'orange' ? 'text-orange-600 bg-orange-50'
    : 'text-blue-600 bg-blue-50';
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function BreakdownCard({ label, value, accent }: {
  label: string; value: string; accent: 'blue' | 'green' | 'orange';
}) {
  const cls = accent === 'green' ? 'bg-green-50 text-green-700 border-green-200'
    : accent === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-base font-bold mt-1 break-words">{value}</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}
