'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, ArrowRight, Briefcase, Calendar, Car, CheckCircle,
  ClipboardList, Clock, CreditCard, Download, ExternalLink, FileText, Heart, Home, Info,
  Loader2, Mail, MapPin, Receipt, RefreshCw, Shield, ShieldCheck, Trash2, User as UserIcon, UserCheck, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PolicyTermsModal } from '@/components/policies/PolicyTermsModal';
import { PolicyPurchaseWizard } from '@/components/policies/PolicyPurchaseWizard';
import api from '@/lib/api';
import { getRelationshipLabel } from '@/lib/policy-helpers';
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

  const [tab, setTab] = useState<TabKey>('browse');
  const [policies, setPolicies] = useState<UserPolicy[]>([]);
  const [plans, setPlans] = useState<PlansData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<UserPolicy | null>(null);
  const [termsCategory, setTermsCategory] = useState<PolicyType | null>(null);
  const [purchaseModal, setPurchaseModal] = useState<{ open: boolean; type: PolicyType; planIdx: number }>({
    open: false,
    type: 'health',
    planIdx: 0,
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-[#2e96ff] bg-[#eef6ff] px-2.5 py-0.5 rounded-full border border-[#2e96ff]/20 mb-1">
            {t('tabMine')}
          </span>
          <h1 className="text-2xl font-bold text-[#13426f] flex items-center gap-2">
            <Shield size={22} className="text-[#2e96ff]" /> {t('title')}
          </h1>
        </div>
        <Link
          href={`/${locale}/claims`}
          className="text-xs md:text-sm font-semibold text-[#13426f] bg-white border border-[#d0d5dd] hover:border-[#2e96ff] hover:text-[#2e96ff] px-4 py-2 rounded-full shadow-xs flex items-center gap-1.5 transition-all"
        >
          <ClipboardList size={14} className="text-[#2e96ff]" /> {t('viewClaims')}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label={t('totalPolicies')} value={stats.total} icon={Shield} />
        <StatCard label={t('totalCoverage')} value={fmtVND(stats.coverage)} icon={CheckCircle} accent="green" />
        <StatCard label={t('totalPremium')} value={fmtVND(stats.premium)} icon={Wallet} accent="orange" />
      </div>

      {/* Tabs: Relief Pill Container */}
      <div className="inline-flex bg-white/80 p-1.5 rounded-full border border-[#d0d5dd] gap-1 shadow-xs">
        <TabBtn active={tab === 'browse'} onClick={() => setTab('browse')} icon={Info}>
          {t('tabBrowseRef')}
        </TabBtn>
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} icon={Briefcase}>
          {t('tabMine')} ({activeCount})
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={Clock}>
          {t('tabHistory')} ({historyCount})
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
          onPurchase={(type) => setPurchaseModal({ open: true, type, planIdx: 0 })}
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

      {purchaseModal.open && (
        <PolicyPurchaseWizard
          initialType={purchaseModal.type}
          onClose={() => setPurchaseModal({ open: false, type: 'health', planIdx: 0 })}
          onSuccess={() => {
            setPurchaseModal({ open: false, type: 'health', planIdx: 0 });
            load();
          }}
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
  const voided = useMemo(() => history.filter((p) => p.status === 'voided'), [history]);

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

      {voided.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-purple-700 uppercase tracking-wide">
              {t('voided')}
            </h2>
            <span className="text-xs text-gray-400">({voided.length})</span>
          </div>
          <div className="flex flex-col gap-2">
            {voided.map((p) => (
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
    voided:    'bg-purple-100 text-purple-700 border-purple-200',
  };
  const statusLabel: Record<string, string> = {
    active: t('active'), expired: t('expired'), cancelled: t('cancelled'), voided: t('voided'),
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
      className="group w-full text-left bg-white border border-[#d0d5dd] rounded-[22px] overflow-hidden hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all flex items-stretch shadow-xs"
    >
      {/* Left: gradient icon block (wider for active) */}
      <div className={`bg-gradient-to-br ${gradient} text-white flex flex-col items-center justify-center px-4 shrink-0 ${isActive ? 'w-24' : 'w-20'}`}>
        <Icon size={isActive ? 28 : 24} />
        {isActive && <p className="text-[9px] font-bold text-white/90 uppercase tracking-wider mt-1">{t('active')}</p>}
      </div>

      {/* Middle: name + meta */}
      <div className="flex-1 min-w-0 px-5 py-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className={`font-bold text-base truncate ${isActive ? 'text-[#13426f]' : 'text-gray-700'}`}>
            {policy.plan_name}
          </h3>
          <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border whitespace-nowrap ${statusCls[policy.status] ?? statusCls.active}`}>
            {statusLabel[policy.status] ?? policy.status}
          </span>
          {daysLeft != null && (
            <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${daysChipCls}`}>
              {daysLeft > 0 ? t('expiresInDays', { days: daysLeft }) : t('expired7d')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <p className="text-xs text-[#4a5568] truncate">
            {tClaims(`claimTypes.${policy.policy_type}` as never)} · <span className="font-mono text-gray-500 font-medium">{policy.policy_number}</span>
          </p>
          {policy.insured_person?.name && (
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#eef6ff] text-[#2e96ff] border border-[#2e96ff]/20">
              👤 Cho: {policy.insured_person.name} ({getRelationshipLabel(policy.insured_person.relationship)})
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1.5 font-medium">
          {startDate.toLocaleDateString()} — {endDate.toLocaleDateString()}
        </p>
      </div>

      {/* Right: coverage + premium + chevron */}
      <div className="px-5 py-4 flex flex-col items-end justify-center border-l border-[#d0d5dd] shrink-0 min-w-[170px] bg-[#f9f7f0]/30">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{t('coverage')}</p>
        <p className={`text-base font-bold ${isActive ? 'text-[#13426f]' : 'text-gray-700'}`}>
          {fmtVND(policy.coverage_amount)}
        </p>
        {isActive && (
          <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
            {t('premium')}: <span className="font-bold text-[#13426f]">{fmtVND(policy.annual_premium)}/{t('yearShort')}</span>
          </p>
        )}
        <div className={`text-xs font-bold flex items-center gap-1 mt-2 group-hover:gap-2 transition-all ${isCancelled ? 'text-gray-400' : 'text-[#2e96ff]'}`}>
          {t('viewDetails')} <ArrowRight size={12} />
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

  // Lọc claims chính xác theo policy_id của hợp đồng này (tránh tính nhầm claims của hợp đồng khác cùng loại)
  useEffect(() => {
    let mounted = true;
    setLoadingClaims(true);
    api.get<Claim[]>('/claims')
      .then((r) => {
        if (!mounted) return;
        setRelated(r.data.filter((c) => c.policy_id === policy.id));
      })
      .catch(() => {})
      .finally(() => mounted && setLoadingClaims(false));
    return () => { mounted = false; };
  }, [policy.id]);

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
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[26px] border border-[#d0d5dd] max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-br ${gradient} p-6 text-white relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
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
          {/* Voided banner (admin/reviewer đã vô hiệu hoá) */}
          {policy.status === 'voided' && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-purple-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-purple-700">{t('voidedBanner')}</p>
                {policy.voided_reason && <p className="text-xs text-gray-600 mt-0.5">{policy.voided_reason}</p>}
              </div>
            </div>
          )}

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

          {/* Insured person info — Người được bảo hiểm */}
          {policy.insured_person?.name && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UserCheck size={14} className="text-emerald-600" /> {t('insuredPersonTitle')}
              </h3>
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <UserIcon size={14} className="text-emerald-600" />
                    <span className="text-gray-500">{t('insuredName')}:</span>
                    <span className="font-semibold text-gray-900">{policy.insured_person.name}</span>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {getRelationshipLabel(policy.insured_person.relationship)}
                  </span>
                </div>
                {policy.insured_person.dob && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={13} className="text-emerald-600" />
                    <span className="text-gray-500">{t('insuredDob')}:</span>
                    <span className="font-medium text-gray-900">{policy.insured_person.dob}</span>
                  </div>
                )}
                {policy.insured_person.id_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <Shield size={13} className="text-emerald-600" />
                    <span className="text-gray-500">{t('insuredId')}:</span>
                    <span className="font-mono font-medium text-gray-900">{policy.insured_person.id_number}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Subject details — Thông tin đối tượng bảo hiểm (tài sản, phương tiện, nông nghiệp, thiên tai) */}
          {policy.subject_details && Object.keys(policy.subject_details).length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText size={14} className="text-blue-600" /> {t('subjectDetailsTitle')}
              </h3>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                {policy.subject_details.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={13} className="text-gray-500" />
                    <span className="text-gray-500">{t('assetAddress')}:</span>
                    <span className="font-medium text-gray-900">{policy.subject_details.address}</span>
                  </div>
                )}
                {policy.subject_details.license_plate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Car size={13} className="text-gray-500" />
                    <span className="text-gray-500">{t('licensePlate')}:</span>
                    <span className="font-mono font-bold text-gray-900">{policy.subject_details.license_plate}</span>
                  </div>
                )}
                {(policy.subject_details.brand || policy.subject_details.model) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Car size={13} className="text-gray-500" />
                    <span className="text-gray-500">{t('vehicleBrand')}:</span>
                    <span className="font-medium text-gray-900">{[policy.subject_details.brand, policy.subject_details.model].filter(Boolean).join(' ')}</span>
                  </div>
                )}
                {policy.subject_details.disaster_plan && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle size={13} className="text-amber-500" />
                    <span className="text-gray-500">{t('disasterSubPlan')}:</span>
                    <span className="font-medium text-gray-900">{policy.subject_details.disaster_plan}</span>
                  </div>
                )}
                {policy.subject_details.crop_type && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle size={13} className="text-emerald-500" />
                    <span className="text-gray-500">{t('cropType')}:</span>
                    <span className="font-medium text-gray-900">{policy.subject_details.crop_type}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Buyer info — người đăng ký / chủ tài khoản */}
          {buyer && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UserIcon size={14} className="text-blue-600" /> {t('buyerInfo')}
              </h3>
              <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-4 space-y-2">
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
        <div className="border-t border-[#d0d5dd] bg-[#f9f7f0] px-6 py-4 flex flex-wrap gap-2.5 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewTerms}
            className="rounded-full text-[#13426f] border-[#d0d5dd] bg-white hover:bg-[#eef6ff] font-semibold"
          >
            <Info size={14} className="mr-1.5 text-[#2e96ff]" /> {t('viewTerms')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadContract}
            disabled={downloadingPdf}
            title={t('downloadContractHint')}
            className="rounded-full text-[#13426f] border-[#d0d5dd] bg-white hover:bg-[#eef6ff] font-semibold"
          >
            {downloadingPdf
              ? <Loader2 size={14} className="mr-1.5 animate-spin" />
              : <Download size={14} className="mr-1.5 text-[#2e96ff]" />}
            {downloadingPdf ? t('downloadingContract') : t('downloadContract')}
          </Button>
          <Link
            href={`/${locale}/claims`}
            className="inline-flex items-center px-4 py-2 rounded-full border border-[#d0d5dd] bg-white text-xs font-semibold text-[#13426f] hover:bg-gray-50 transition-colors"
          >
            <ExternalLink size={14} className="mr-1.5 text-[#2e96ff]" /> {t('viewClaims')}
          </Link>
          {policy.status !== 'cancelled' && policy.status !== 'voided' && (
            <Button
              variant="outline"
              size="sm"
              onClick={renewPolicy}
              disabled={renewing}
              className="rounded-full text-emerald-700 bg-white hover:bg-emerald-50 border-emerald-300 font-semibold"
            >
              {renewing ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <RefreshCw size={14} className="mr-1.5" />}
              {t('renewBtn')}
            </Button>
          )}
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancelPolicy}
              disabled={cancelling}
              className="rounded-full text-red-600 bg-white hover:bg-red-50 border-red-300 font-semibold"
            >
              {cancelling ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Trash2 size={14} className="mr-1.5" />}
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
  plans, ownedTypes, onViewTerms, onPurchase,
}: {
  plans: PlansData | null;
  ownedTypes: Set<string>;
  onViewTerms: (cat: PolicyType) => void;
  onPurchase: (cat: PolicyType, planIdx: number) => void;
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
      {/* CTA Banner: Deep Harbor */}
      <div className="bg-[#13426f] text-white border border-[#0d2d4c] rounded-[24px] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-[#2e96ff]/20 text-[#2e96ff] border border-[#2e96ff]/30 flex items-center justify-center shrink-0">
            <FileText size={22} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-white mb-1">{t('purchaseFlowTitle')}</h3>
            <p className="text-sm text-white/80 leading-relaxed max-w-2xl">{t('purchaseFlowHint')}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/documents`}
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2e96ff] text-white text-sm font-bold shadow-[0_4px_0_0_rgba(154,207,246,0.5)] hover:bg-[#2582df] transition-all"
        >
          {t('goToDocuments')} <ArrowRight size={14} />
        </Link>
      </div>

      {/* Type selector */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('selectType')}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {POLICY_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type];
            const isSelected = selectedType === type;
            const owned = ownedTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`relative flex flex-col items-center gap-1.5 p-3.5 rounded-[18px] border-2 transition-all ${
                  isSelected
                    ? 'border-[#2e96ff] bg-[#eef6ff] shadow-[0_4px_0_0_rgba(154,207,246,0.5)]'
                    : 'border-[#d0d5dd] bg-white hover:border-[#2e96ff]/50'
                }`}
              >
                {owned && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <CheckCircle size={10} />
                  </span>
                )}
                <Icon size={20} className={isSelected ? 'text-[#2e96ff]' : 'text-gray-500'} />
                <span className={`text-xs font-bold text-center leading-tight ${isSelected ? 'text-[#13426f]' : 'text-[#4a5568]'}`}>
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
          <h2 className="font-bold text-lg text-[#13426f]">
            {tClaims(`claimTypes.${selectedType}` as never)}
          </h2>
          {ownedTypes.has(selectedType) && (
            <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full flex items-center gap-1.5">
              <AlertTriangle size={12} /> {t('alreadyOwned')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {typePlans.map((plan, idx) => {
            const gradient = TYPE_COLORS[selectedType];
            const isPopular = idx === 1;
            return (
              <div
                key={idx}
                className={`relative bg-white border border-[#d0d5dd] rounded-[22px] overflow-hidden flex flex-col transition-all shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] ${
                  isPopular ? 'border-[#2e96ff]' : ''
                }`}
              >
                {isPopular && (
                  <div className="absolute top-3 right-3">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#2e96ff] text-white shadow-xs">
                      ★ {t('popularBadge')}
                    </span>
                  </div>
                )}
                <div className={`h-2.5 bg-gradient-to-r ${gradient}`} />

                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-lg text-[#13426f]">{plan.plan_name}</h3>
                  {plan.description && (
                    <p className="text-xs text-gray-500 mt-1 mb-4 leading-relaxed font-normal">{plan.description}</p>
                  )}

                  <div className="mt-auto space-y-2 mb-5 bg-[#f9f7f0]/60 p-4 rounded-[16px] border border-[#d0d5dd]">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t('coverage')}</div>
                    <div className="text-xl font-bold text-[#13426f]">{fmtVND(plan.coverage_amount)}</div>
                    <div className="border-t border-[#d0d5dd] pt-2">
                      <span className="text-xs text-gray-500">{t('premium')}: </span>
                      <span className="font-bold text-[#2e96ff]">{fmtVND(plan.annual_premium)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => onPurchase(selectedType, idx)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#2e96ff] text-white text-sm font-bold hover:bg-[#2582df] shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-[1px] active:shadow-xs transition-all"
                    >
                      <ShieldCheck size={16} /> Đăng ký gói này
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewTerms(selectedType)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-[#0d2d4c] bg-white text-[#13426f] text-xs font-semibold hover:bg-[#eef6ff] transition-all"
                    >
                      <Info size={14} /> {t('viewTerms')}
                    </button>
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
      className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-bold rounded-full transition-all ${
        active
          ? 'bg-[#2e96ff] text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)]'
          : 'text-[#4a5568] hover:text-[#13426f] hover:bg-[#f9f7f0]'
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
  const color = accent === 'green' ? 'text-emerald-600 bg-emerald-50 border border-emerald-200'
    : accent === 'orange' ? 'text-amber-600 bg-amber-50 border border-amber-200'
    : 'text-[#2e96ff] bg-[#eef6ff] border border-[#2e96ff]/20';
  return (
    <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
          <Icon size={15} />
        </div>
      </div>
      <p className="text-2xl font-bold text-[#13426f]">{value}</p>
    </div>
  );
}

function BreakdownCard({ label, value, accent }: {
  label: string; value: string; accent: 'blue' | 'green' | 'orange';
}) {
  const cls = accent === 'green' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : accent === 'orange' ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-[#eef6ff] text-[#13426f] border-[#2e96ff]/20';
  return (
    <div className={`border rounded-[16px] p-3.5 ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
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
