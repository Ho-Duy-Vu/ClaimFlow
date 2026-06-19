'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle, Clock, Copy, FileText, Loader2,
  RefreshCw, ShieldAlert, ShieldCheck, User as UserIcon, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import { PROVINCES } from '@/lib/provinces';
import type { User } from '@/types';

interface ClaimUser {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  province: string | null;
  is_active: boolean;
}
interface ClaimPolicy {
  id: string;
  policy_number: string;
  policy_type: string;
  plan_name: string;
  insurer: string;
  coverage_amount: number;
  coverage_spent_before: number;
  coverage_remaining: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
}
interface BankAccount { account_number: string; bank_name: string; account_holder: string }
interface WitnessInfo { name?: string | null; phone?: string | null; relation?: string | null }
interface IncidentLocation { address: string; lat?: number | null; lng?: number | null }

interface QueueClaim {
  id: string;
  user_id: string;
  user: ClaimUser | null;
  policy_id: string | null;
  policy: ClaimPolicy | null;
  claim_type: string;
  status: string;
  amount_claimed: number;
  amount_approved: number | null;
  province: string | null;
  disaster_type: string | null;
  description: string | null;
  incident_date: string | null;
  incident_time: string | null;
  incident_location: IncidentLocation | null;
  incident_type: string | null;
  bank_account: BankAccount | null;
  witness_info: WitnessInfo | null;
  hospital_admission_number: string | null;
  police_report_number: string | null;
  fact_declaration: boolean;
  ai_decision: string | null;
  ai_reasoning: string | null;
  ai_fraud_score: number | null;
  ai_fraud_flags: string[];
  ai_parsed_data: Record<string, unknown> | null;
  reviewer_id: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  // TASK-029
  is_partial_approval: boolean;
  reduction_reason: string | null;
  additional_info_requested: string[];
  additional_info_requested_at: string | null;
  additional_info_provided_at: string | null;
  payment_status: 'not_applicable' | 'pending' | 'paid' | 'failed';
  payment_transaction_ref: string | null;
  payment_marked_at: string | null;
  documents: Array<{ id: string; doc_type: string; file_name: string }>;
  evidence_files: Array<{ id: string; doc_type: string; file_name: string }>;
  created_at: string;
  waiting_seconds: number;
}

interface ReviewerStats {
  reviewer_email: string;
  reviewed_today: number;
  reviewed_week: number;
  reviewed_total: number;
  avg_review_time_minutes: number;
  override_rate: number;
  pending_in_queue: number;
  ai_approved: number;
  ai_rejected: number;
  ai_decided_total: number;
  human_approved: number;
  human_rejected: number;
  human_decided_total: number;
  total_decided: number;
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

function fmtWait(seconds: number, tr: { minutes: string; hours: string }) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} ${tr.minutes}`;
  return `${(seconds / 3600).toFixed(1)} ${tr.hours}`;
}

function fraudColor(score: number | null) {
  if (score == null) return 'text-gray-500';
  if (score >= 70) return 'text-red-600';
  if (score >= 30) return 'text-amber-600';
  return 'text-green-600';
}

export function ReviewerClient() {
  const t = useTranslations('reviewer');
  const tCommon = useTranslations('common');
  const tClaims = useTranslations('claims');
  const tAdmin = useTranslations('admin');
  const router = useRouter();
  const locale = useLocale();

  const [authChecking, setAuthChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [queue, setQueue] = useState<QueueClaim[]>([]);
  const [stats, setStats] = useState<ReviewerStats | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selected, setSelected] = useState<QueueClaim | null>(null);

  const [statusFilter, setStatusFilter] = useState<'manual_review' | 'approved' | 'rejected' | 'processing' | 'info_requested' | 'all'>('manual_review');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [provinceFilter, setProvinceFilter] = useState('');
  const [disasterFilter, setDisasterFilter] = useState('');
  const [minFraud, setMinFraud] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<User>('/auth/me');
        if (r.data.role !== 'admin' && r.data.role !== 'reviewer') {
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

  const loadQueue = useCallback(async () => {
    if (!allowed) return;
    setLoadingQueue(true);
    try {
      const params: Record<string, string> = { status: statusFilter };
      if (provinceFilter) params.province = provinceFilter;
      if (disasterFilter) params.disaster_type = disasterFilter;
      if (minFraud) params.min_fraud_score = minFraud;
      const r = await api.get<{ items: QueueClaim[]; counts?: Record<string, number> }>('/reviewer/queue', { params });
      setQueue(r.data.items);
      if (r.data.counts) setStatusCounts(r.data.counts);
    } finally {
      setLoadingQueue(false);
    }
  }, [allowed, statusFilter, provinceFilter, disasterFilter, minFraud]);

  const loadStats = useCallback(async () => {
    if (!allowed) return;
    try {
      const r = await api.get<ReviewerStats>('/reviewer/stats');
      setStats(r.data);
    } catch {
      // silent
    }
  }, [allowed]);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => { loadStats(); }, [loadStats]);

  if (authChecking) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600" size={28} /></div>;
  }
  if (!allowed) {
    return <div className="text-center text-gray-400 mt-12">{tAdmin('noPermission')}</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <ShieldCheck size={22} className="text-blue-600" /> {t('title')}
      </h1>

      {/* Stats — pending + review activity */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <StatCard label={t('pendingInQueue')} value={stats?.pending_in_queue ?? '—'} accent="orange" icon={AlertTriangle} />
        <StatCard label={t('reviewedToday')} value={stats?.reviewed_today ?? '—'} icon={CheckCircle} accent="blue" />
        <StatCard label={t('reviewedWeek')} value={stats?.reviewed_week ?? '—'} />
        <StatCard label={t('avgReviewTime')} value={stats ? `${stats.avg_review_time_minutes}m` : '—'} />
        <StatCard label={t('overrideRate')} value={stats ? `${stats.override_rate}%` : '—'} />
      </div>

      {/* Stats — AI vs human decision volume */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t('aiApproved')} value={stats?.ai_approved ?? '—'} accent="green" icon={CheckCircle} />
        <StatCard label={t('aiRejected')} value={stats?.ai_rejected ?? '—'} accent="red" icon={X} />
        <StatCard label={t('humanApproved')} value={stats?.human_approved ?? '—'} accent="green" />
        <StatCard label={t('humanRejected')} value={stats?.human_rejected ?? '—'} accent="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Queue */}
        <div className="bg-white border rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">{t('queue')}</h2>
            <Button variant="outline" size="sm" onClick={loadQueue} disabled={loadingQueue}>
              <RefreshCw size={14} className={`mr-2 ${loadingQueue ? 'animate-spin' : ''}`} />
              {tCommon('refresh')}
            </Button>
          </div>

          {/* Status tabs */}
          <div className="flex flex-wrap gap-1 mb-3 border-b">
            {([
              { key: 'manual_review' as const,  label: t('tabManualReview'),  color: 'orange' },
              { key: 'info_requested' as const, label: t('tabInfoRequested'), color: 'amber' },
              { key: 'approved' as const,       label: t('tabApproved'),      color: 'green' },
              { key: 'rejected' as const,       label: t('tabRejected'),      color: 'red' },
              { key: 'processing' as const,     label: t('tabProcessing'),    color: 'blue' },
              { key: 'all' as const,            label: t('tabAll'),           color: 'gray' },
            ]).map((tab) => {
              const active = statusFilter === tab.key;
              const count = tab.key === 'all'
                ? Object.values(statusCounts).reduce((s, n) => s + n, 0)
                : statusCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    active ? `border-blue-600 text-blue-700` : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                  {count != null && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <select
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value)}
              className="h-8 px-2 rounded border bg-white"
            >
              <option value="">{t('filterProvince')}</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={disasterFilter}
              onChange={(e) => setDisasterFilter(e.target.value)}
              className="h-8 px-2 rounded border bg-white"
            >
              <option value="">{t('filterDisaster')}</option>
              <option value="flood">flood</option>
              <option value="storm">storm</option>
              <option value="landslide">landslide</option>
              <option value="drought">drought</option>
              <option value="inundation">inundation</option>
            </select>
            <Input
              type="number"
              placeholder={t('minFraud')}
              value={minFraud}
              onChange={(e) => setMinFraud(e.target.value)}
              className="h-8 w-32"
            />
          </div>

          {loadingQueue ? (
            <div className="text-center py-8"><Loader2 className="inline animate-spin" /></div>
          ) : queue.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">{t('noClaims')}</div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {queue.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                    selected?.id === c.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium">{tClaims(`claimTypes.${c.claim_type}` as any)}</span>
                    <span className="text-xs text-orange-600 flex items-center gap-1">
                      <Clock size={12} /> {fmtWait(c.waiting_seconds, { minutes: t('minutes'), hours: t('hours') })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{c.province ?? '—'} · {fmtVND(c.amount_claimed)}</span>
                    {c.ai_fraud_score != null && (
                      <span className={`font-semibold ${fraudColor(c.ai_fraud_score)}`}>
                        Fraud: {c.ai_fraud_score}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-white border rounded-xl p-4">
          {selected ? (
            <DetailPanel
              claim={selected}
              onDone={() => { setSelected(null); loadQueue(); loadStats(); }}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="text-center text-gray-400 py-12 text-sm">{t('selectClaim')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ claim, onDone, onClose }: { claim: QueueClaim; onDone: () => void; onClose: () => void }) {
  const t = useTranslations('reviewer');
  const tClaims = useTranslations('claims');
  const tCommon = useTranslations('common');
  const toast = useToast();
  const confirm = useConfirm();

  const [note, setNote] = useState('');
  const [amountApproved, setAmountApproved] = useState(claim.amount_claimed.toString());
  const [submitting, setSubmitting] = useState(false);
  const [txRef, setTxRef] = useState('');
  const [paying, setPaying] = useState(false);

  // TASK-029: partial approval + request more info
  const [reductionReason, setReductionReason] = useState('');
  const [fieldsNeededRaw, setFieldsNeededRaw] = useState(''); // newline-separated

  type Decision = 'approved' | 'rejected' | 'partial_approved' | 'info_requested';

  const decide = async (decision: Decision) => {
    if (!note.trim()) { toast.warning(t('noteRequired')); return; }

    const amount = parseFloat(amountApproved) || 0;
    const fieldsNeeded = fieldsNeededRaw
      .split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

    // Client-side validation
    if (decision === 'partial_approved') {
      if (amount <= 0) { toast.warning(t('errPartialAmount')); return; }
      if (amount >= claim.amount_claimed) { toast.warning(t('errPartialFullAmount')); return; }
      if (!reductionReason.trim()) { toast.warning(t('errReductionReason')); return; }
    }
    if (decision === 'info_requested' && fieldsNeeded.length === 0) {
      toast.warning(t('errFieldsNeeded'));
      return;
    }

    const titleKey =
      decision === 'approved'         ? 'approveTitle'
      : decision === 'partial_approved' ? 'partialTitle'
      : decision === 'info_requested'   ? 'infoRequestedTitle'
      : 'rejectTitle';
    const confirmKey =
      decision === 'approved'         ? 'approveConfirm'
      : decision === 'partial_approved' ? 'partialConfirm'
      : decision === 'info_requested'   ? 'infoRequestedConfirm'
      : 'rejectConfirm';
    const btnKey =
      decision === 'approved'         ? 'approveBtn'
      : decision === 'partial_approved' ? 'partialBtn'
      : decision === 'info_requested'   ? 'infoRequestedBtn'
      : 'rejectBtn';

    const ok = await confirm({
      title: t(titleKey),
      message: t(confirmKey),
      confirmLabel: t(btnKey),
      cancelLabel: tCommon('cancel'),
      variant:
        decision === 'rejected' || decision === 'info_requested' ? 'danger'
        : 'warning',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await api.patch(`/claims/${claim.id}/review`, {
        decision,
        note: note.trim(),
        amount_approved:
          decision === 'approved' || decision === 'partial_approved' ? amount : null,
        reduction_reason: decision === 'partial_approved' ? reductionReason.trim() : null,
        fields_needed: decision === 'info_requested' ? fieldsNeeded : [],
      });
      const successKey =
        decision === 'approved'         ? 'approveSuccess'
        : decision === 'partial_approved' ? 'partialSuccess'
        : decision === 'info_requested'   ? 'infoRequestedSuccess'
        : 'rejectSuccess';
      toast.success(t(successKey));
      onDone();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const markPaid = async () => {
    if (!txRef.trim()) { toast.warning(t('txRefRequired')); return; }
    const ok = await confirm({
      title: t('markPaidTitle'),
      message: t('markPaidConfirm', { amount: fmtVND(claim.amount_approved ?? 0) }),
      confirmLabel: t('markPaidBtn'),
      cancelLabel: tCommon('cancel'),
      variant: 'warning',
    });
    if (!ok) return;
    setPaying(true);
    try {
      await api.patch(`/claims/${claim.id}/mark-paid`, { transaction_ref: txRef.trim() });
      toast.success(t('markPaidSuccess'));
      onDone();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Error');
    } finally {
      setPaying(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}: ${tCommon('copied')}`);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg">{tClaims(`claimTypes.${claim.claim_type}` as any)}</h3>
          <p className="text-xs text-gray-500 font-mono truncate">{claim.id}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={tCommon('close')}
          title={tCommon('close')}
          className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* User */}
      <Section title={t('sectionUser')} icon={UserIcon}>
        {claim.user ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoCell label={t('userName')} value={claim.user.full_name ?? '—'} />
            <InfoCell label={t('userEmail')} value={claim.user.email} />
            {claim.user.phone && <InfoCell label={t('userPhone')} value={claim.user.phone} />}
            <InfoCell label={tClaims('province')} value={claim.user.province ?? '—'} />
          </div>
        ) : <p className="text-xs text-gray-400">—</p>}
      </Section>

      {/* Policy */}
      {claim.policy && (
        <Section title={t('sectionPolicy')} icon={ShieldCheck}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoCell label={t('policyPlan')} value={claim.policy.plan_name} />
            <InfoCell label={t('policyNumber')} value={claim.policy.policy_number} />
            <InfoCell label={t('policyCoverage')} value={fmtVND(claim.policy.coverage_amount)} />
            <InfoCell label={t('policyRemaining')} value={fmtVND(claim.policy.coverage_remaining)} />
          </div>
        </Section>
      )}

      {/* Incident */}
      <Section title={t('sectionIncident')} icon={AlertTriangle}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoCell label={tClaims('amountClaimed')} value={fmtVND(claim.amount_claimed)} />
          <InfoCell label={t('incidentDate')} value={claim.incident_date ? new Date(claim.incident_date).toLocaleDateString() + (claim.incident_time ? ` ${claim.incident_time}` : '') : '—'} />
          <InfoCell label={t('incidentType')} value={claim.incident_type ?? '—'} />
          <InfoCell label={tClaims('province')} value={claim.province ?? '—'} />
          {claim.disaster_type && (
            <InfoCell label={tClaims('disasterType')} value={tClaims(`disasterTypes.${claim.disaster_type}` as any) || claim.disaster_type} />
          )}
          {claim.incident_location?.address && (
            <div className="col-span-2">
              <InfoCell label={t('incidentLocation')} value={claim.incident_location.address} />
            </div>
          )}
        </div>
        {claim.description && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-1">{tClaims('description')}</p>
            <p className="text-sm text-gray-700 bg-gray-50 border rounded-md p-2 whitespace-pre-wrap">{claim.description}</p>
          </div>
        )}
      </Section>

      {/* Bank account — payout target */}
      {claim.bank_account && (
        <Section title={t('sectionBank')} icon={Wallet} accent="blue">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoCell label={t('bankName')} value={claim.bank_account.bank_name} />
            <div>
              <p className="text-xs text-gray-500">{t('bankAccountNumber')}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono font-semibold">{claim.bank_account.account_number}</p>
                <button onClick={() => copy(claim.bank_account!.account_number, t('bankAccountNumber'))} className="text-blue-600 hover:text-blue-800">
                  <Copy size={11} />
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <InfoCell label={t('bankAccountHolder')} value={claim.bank_account.account_holder} />
            </div>
          </div>
        </Section>
      )}

      {/* Other supporting refs */}
      {(claim.hospital_admission_number || claim.police_report_number || (claim.witness_info && (claim.witness_info.name || claim.witness_info.phone))) && (
        <Section title={t('sectionOther')} icon={FileText}>
          <div className="space-y-1 text-sm">
            {claim.hospital_admission_number && <InfoCell label={t('hospitalNum')} value={claim.hospital_admission_number} />}
            {claim.police_report_number && <InfoCell label={t('policeNum')} value={claim.police_report_number} />}
            {claim.witness_info?.name && <InfoCell label={t('witnessName')} value={`${claim.witness_info.name}${claim.witness_info.phone ? ' · ' + claim.witness_info.phone : ''}`} />}
          </div>
        </Section>
      )}

      {/* Evidence files */}
      {(claim.evidence_files.length > 0 || claim.documents.length > 0) && (
        <Section title={t('sectionEvidence')} icon={FileText}>
          {claim.evidence_files.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mb-1">{t('evidenceFiles')} ({claim.evidence_files.length})</p>
              <ul className="text-sm mb-2 space-y-1">
                {claim.evidence_files.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-gray-600">
                    <FileText size={12} className="text-amber-600" /> {d.file_name}
                    <span className="text-xs text-gray-400">({d.doc_type})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {claim.documents.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mb-1">{t('supportingDocs')} ({claim.documents.length})</p>
              <ul className="text-sm space-y-1">
                {claim.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-gray-600">
                    <FileText size={12} /> {d.file_name}
                    <span className="text-xs text-gray-400">({d.doc_type})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {/* AI section (collapsed by default) */}
      <details className="rounded-lg border p-3 bg-gray-50">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <ShieldAlert size={12} /> {t('sectionAI')} · {claim.ai_decision ?? '—'} ({tClaims('fraudScore')}: {claim.ai_fraud_score ?? '—'})
        </summary>
        <div className="mt-3 space-y-2">
          {claim.ai_fraud_score != null && (
            <div className="h-2 bg-gray-200 rounded overflow-hidden">
              <div className={`h-full ${claim.ai_fraud_score >= 70 ? 'bg-red-600' : claim.ai_fraud_score >= 30 ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${claim.ai_fraud_score}%` }} />
            </div>
          )}
          {claim.ai_fraud_flags.length > 0 && (
            <ul className="space-y-0.5 text-xs text-red-700">
              {claim.ai_fraud_flags.map((f, i) => (<li key={i}>• {f}</li>))}
            </ul>
          )}
          {claim.ai_reasoning && (
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{claim.ai_reasoning}</p>
          )}
        </div>
      </details>

      {/* Payment workflow — only humans handle money. Shows for approved claims. */}
      {claim.status === 'approved' && claim.payment_status !== 'not_applicable' && (
        <div className={`rounded-lg border p-3 ${
          claim.payment_status === 'paid' ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={13} className={claim.payment_status === 'paid' ? 'text-green-700' : 'text-amber-700'} />
              {t('paymentStatus')}
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              claim.payment_status === 'paid' ? 'bg-green-200 text-green-900' : 'bg-amber-200 text-amber-900'
            }`}>
              {t(claim.payment_status === 'paid' ? 'paymentPaid' : 'paymentPending')}
            </span>
          </div>
          {claim.payment_status === 'paid' ? (
            <div className="text-xs text-gray-700 space-y-1">
              <p><span className="text-gray-500">{t('txRef')}:</span> <span className="font-mono">{claim.payment_transaction_ref}</span></p>
              {claim.payment_marked_at && <p><span className="text-gray-500">{t('paidAt')}:</span> {new Date(claim.payment_marked_at).toLocaleString()}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-800">{t('paymentPendingHint')}</p>
              <div className="flex gap-2">
                <Input
                  placeholder={t('txRefPlaceholder')}
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  className="text-sm h-8 flex-1"
                />
                <Button size="sm" onClick={markPaid} disabled={paying} className="bg-green-600 hover:bg-green-700 text-xs">
                  {paying ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle size={12} className="mr-1" />}
                  {t('markPaidBtn')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action area — 3 nhánh:
          (1) Final decision (approved/rejected) hoặc đang chờ user bổ sung (info_requested)
              → readonly summary
          (2) User đã bổ sung → manual_review + additional_info_provided_at
              → banner "chờ duyệt lại" + mở form cho reviewer quyết định lần 2
          (3) Chưa có reviewer → form quyết định gốc
      */}
      {(() => {
        const isApproved = claim.status === 'approved';
        const isRejected = claim.status === 'rejected';
        const isInfoReq = claim.status === 'info_requested';
        const isPartial = isApproved && claim.is_partial_approval;
        const isPendingReReview =
          !!claim.reviewer_id
          && claim.status === 'manual_review'
          && !!claim.additional_info_provided_at;
        const showReadonly =
          !!claim.reviewer_id && (isApproved || isRejected || isInfoReq);

        if (showReadonly) {
          const borderCls = isInfoReq ? 'border-amber-200 bg-amber-50'
            : isPartial   ? 'border-yellow-200 bg-yellow-50'
            : isApproved  ? 'border-green-200 bg-green-50'
            : isRejected  ? 'border-red-200 bg-red-50'
            : 'border-gray-200 bg-gray-50';
          const textCls = isInfoReq ? 'text-amber-800'
            : isPartial   ? 'text-yellow-800'
            : isApproved  ? 'text-green-800'
            : isRejected  ? 'text-red-800'
            : 'text-gray-800';
          const labelKey = isInfoReq ? 'decisionInfoRequested'
            : isPartial   ? 'decisionPartial'
            : isApproved  ? 'decisionApproved'
            : isRejected  ? 'decisionRejected'
            : 'alreadyReviewed';
          const StatusIcon = isInfoReq ? AlertTriangle
            : isApproved  ? CheckCircle
            : isRejected  ? X
            : AlertTriangle;
          const iconColor = isInfoReq ? 'text-amber-600'
            : isPartial   ? 'text-yellow-600'
            : isApproved  ? 'text-green-600'
            : isRejected  ? 'text-red-600'
            : 'text-gray-500';

          return (
            <div className="border-t pt-4 space-y-3">
              <div className={`rounded-lg border p-3 ${borderCls}`}>
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon size={16} className={iconColor} />
                  <p className={`font-semibold text-sm ${textCls}`}>
                    {t('alreadyReviewed')} — {t(labelKey)}
                  </p>
                </div>
                {claim.amount_approved != null && (
                  <p className="text-xs text-gray-600 mb-1">
                    <span className="text-gray-500">{t('amountApproved')}:</span>{' '}
                    <span className="font-semibold text-gray-800">{fmtVND(claim.amount_approved)}</span>
                    {isPartial && (
                      <span className="text-yellow-700 ml-2">
                        / {fmtVND(claim.amount_claimed)} ({t('reductionRatio', { pct: Math.round((claim.amount_approved / claim.amount_claimed) * 100) })})
                      </span>
                    )}
                  </p>
                )}
                {claim.reduction_reason && (
                  <p className="text-xs text-gray-700 mt-1">
                    <span className="text-gray-500">{t('reductionReasonLabel')}:</span>{' '}
                    {claim.reduction_reason}
                  </p>
                )}
                {claim.additional_info_requested.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-current/10">
                    <p className="text-xs text-gray-500 mb-1">{t('fieldsNeededTitle')}:</p>
                    <ul className="text-sm text-gray-700 space-y-0.5">
                      {claim.additional_info_requested.map((f, i) => (
                        <li key={i}>• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {claim.reviewed_at && (
                  <p className="text-xs text-gray-500 mt-2">
                    {t('reviewedAt')}: {new Date(claim.reviewed_at).toLocaleString()}
                  </p>
                )}
                {claim.reviewer_note && (
                  <div className="mt-2 pt-2 border-t border-current/10">
                    <p className="text-xs text-gray-500 mb-0.5">{t('note')}:</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{claim.reviewer_note}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 italic">{t('readOnlyHint')}</p>
            </div>
          );
        }

        // (2) + (3): action form is shown. Re-review case prepends a context banner.
        return (
        <div className="border-t pt-4 space-y-3">
          {isPendingReReview && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <RefreshCw size={16} className="text-blue-600" />
                <p className="font-semibold text-sm text-blue-800">{t('reReviewBanner')}</p>
              </div>
              {claim.additional_info_provided_at && (
                <p className="text-xs text-blue-700">
                  {t('reReviewProvidedAt')}: {new Date(claim.additional_info_provided_at).toLocaleString()}
                </p>
              )}
              {claim.additional_info_requested.length > 0 && (
                <div className="mt-2 pt-2 border-t border-blue-200/60">
                  <p className="text-xs font-medium text-blue-800 mb-0.5">{t('reReviewOriginalRequest')}:</p>
                  <ul className="text-xs text-blue-700 space-y-0.5">
                    {claim.additional_info_requested.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {claim.reviewer_note && (
                <div className="mt-2 pt-2 border-t border-blue-200/60">
                  <p className="text-xs text-blue-600 mb-0.5">{t('reReviewPreviousNote')}:</p>
                  <p className="text-xs text-blue-800 whitespace-pre-wrap">{claim.reviewer_note}</p>
                </div>
              )}
            </div>
          )}

          {claim.ai_decision && (claim.status === 'approved' || claim.status === 'rejected') && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
              {t('overridingAIHint')} <strong>{claim.ai_decision}</strong>
            </div>
          )}
          <div>
            <Label>{t('amountApproved')}</Label>
            <Input
              type="number"
              value={amountApproved}
              onChange={(e) => setAmountApproved(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">{t('amountClaimedHint')}: {fmtVND(claim.amount_claimed)}</p>
          </div>

          {/* Partial approval — show reduction_reason input only if amount < claimed */}
          {parseFloat(amountApproved) > 0 && parseFloat(amountApproved) < claim.amount_claimed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <AlertTriangle size={11} /> {t('partialDetectedHint')}
              </p>
              <textarea
                value={reductionReason}
                onChange={(e) => setReductionReason(e.target.value)}
                placeholder={t('reductionReasonPh')}
                className="w-full h-16 px-2 py-1.5 rounded border text-xs"
              />
            </div>
          )}

          <div>
            <Label>{t('note')}</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-20 px-3 py-2 rounded-md border text-sm"
              placeholder={t('note')}
            />
          </div>

          {/* Fields needed input — only relevant for Request Info */}
          <details className="rounded-lg border border-orange-200 bg-orange-50/50 p-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-orange-800 flex items-center gap-1">
              <AlertTriangle size={11} /> {t('fieldsNeededTitle')}
            </summary>
            <textarea
              value={fieldsNeededRaw}
              onChange={(e) => setFieldsNeededRaw(e.target.value)}
              placeholder={t('fieldsNeededPh')}
              className="mt-2 w-full h-20 px-2 py-1.5 rounded border text-xs"
            />
            <p className="text-xs text-gray-500 mt-1">{t('fieldsNeededHint')}</p>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="px-3 text-xs"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={() => decide(
                parseFloat(amountApproved) > 0 && parseFloat(amountApproved) < claim.amount_claimed
                  ? 'partial_approved' : 'approved'
              )}
              disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-xs"
            >
              {submitting ? <Loader2 className="animate-spin mr-1" size={12} /> : <CheckCircle size={12} className="mr-1" />}
              {parseFloat(amountApproved) > 0 && parseFloat(amountApproved) < claim.amount_claimed
                ? t('partialBtn') : t('approve')}
            </Button>
            <Button
              onClick={() => decide('info_requested')}
              disabled={submitting}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-xs"
            >
              {submitting ? <Loader2 className="animate-spin mr-1" size={12} /> : <AlertTriangle size={12} className="mr-1" />}
              {t('requestInfoBtn')}
            </Button>
            <Button
              onClick={() => decide('rejected')}
              disabled={submitting}
              variant="destructive"
              className="flex-1 text-xs"
            >
              {submitting ? <Loader2 className="animate-spin mr-1" size={12} /> : <X size={12} className="mr-1" />}
              {t('reject')}
            </Button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function StatCard({ label, value, accent, icon: Icon }: { label: string; value: string | number; accent?: 'blue' | 'orange' | 'green' | 'red'; icon?: typeof Clock }) {
  const color =
    accent === 'orange' ? 'text-orange-600' :
    accent === 'blue'   ? 'text-blue-600'   :
    accent === 'green'  ? 'text-green-600'  :
    accent === 'red'    ? 'text-red-600'    : 'text-gray-900';
  return (
    <div className="bg-white border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} className={color} />}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Section({
  title, icon: Icon, accent, children,
}: {
  title: string;
  icon: typeof Clock;
  accent?: 'blue';
  children: React.ReactNode;
}) {
  const headerColor = accent === 'blue' ? 'text-blue-700' : 'text-gray-700';
  return (
    <div className="rounded-lg border p-3 bg-white">
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${headerColor}`}>
        <Icon size={13} /> {title}
      </p>
      {children}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
