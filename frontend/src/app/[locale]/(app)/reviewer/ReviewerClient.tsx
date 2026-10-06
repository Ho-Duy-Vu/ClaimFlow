'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, Ban, Building2, Calendar,
  CheckCircle, ChevronRight, Clock, Copy, ExternalLink, FileCheck2, FileText,
  Heart, History, Hospital, Info, Layers, Loader2, MapPin, Navigation, Percent, Phone,
  Plus, RefreshCw, Scale, Search, ShieldAlert, ShieldCheck, Sparkles, Star, Trash2,
  User as UserIcon, Wallet, Wrench, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import { fraudFlagLabel } from '@/lib/fraudFlags';
import { getRelationshipLabel } from '@/lib/policy-helpers';
import { PROVINCES } from '@/lib/provinces';
import { getDistanceMatrixGoong } from '@/lib/goong';
import type {
  User, DamageAssessment, AdjustmentItem, ClaimantHistory, SLAInfo, PartnerLinkedInfo,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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
  insured_person?: {
    name: string;
    dob?: string;
    id_number?: string;
    relationship?: string;
  } | null;
  subject_details?: Record<string, any> | null;
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
  damage_assessment?: DamageAssessment | null;
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
  // Enterprise Cockpit Fields
  claimant_history?: ClaimantHistory | null;
  sla?: SLAInfo | null;
  partner?: PartnerLinkedInfo | null;
  adjustment_items?: AdjustmentItem[];
  internal_note?: string | null;
  customer_notice?: string | null;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-[#2e96ff] bg-[#eef6ff] px-2.5 py-0.5 rounded-full border border-[#2e96ff]/20 mb-1">
            Cockpit Giám định
          </span>
          <h1 className="text-2xl font-bold text-[#13426f] flex items-center gap-2">
            <ShieldCheck size={22} className="text-[#2e96ff]" /> {t('title')}
          </h1>
        </div>
      </div>

      {/* Stats — pending + review activity */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <StatCard label={t('pendingInQueue')} value={stats?.pending_in_queue ?? '—'} accent="orange" icon={AlertTriangle} />
        <StatCard label={t('reviewedToday')} value={stats?.reviewed_today ?? '—'} icon={CheckCircle} accent="blue" />
        <StatCard label={t('reviewedWeek')} value={stats?.reviewed_week ?? '—'} />
        <StatCard label={t('avgReviewTime')} value={stats ? `${stats.avg_review_time_minutes}m` : '—'} />
        <StatCard label={t('overrideRate')} value={stats ? `${stats.override_rate}%` : '—'} />
      </div>

      {/* Stats — AI vs human decision volume */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard label={t('aiApproved')} value={stats?.ai_approved ?? '—'} accent="green" icon={CheckCircle} />
        <StatCard label={t('aiRejected')} value={stats?.ai_rejected ?? '—'} accent="red" icon={X} />
        <StatCard label={t('humanApproved')} value={stats?.human_approved ?? '—'} accent="green" />
        <StatCard label={t('humanRejected')} value={stats?.human_rejected ?? '—'} accent="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Queue */}
        <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-center mb-3.5">
            <h2 className="font-bold text-base text-[#13426f]">{t('queue')}</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadQueue}
              disabled={loadingQueue}
              className="rounded-full text-xs font-semibold text-[#13426f] border-[#d0d5dd] bg-white hover:bg-[#eef6ff] shadow-xs"
            >
              <RefreshCw size={13} className={`mr-1.5 text-[#2e96ff] ${loadingQueue ? 'animate-spin' : ''}`} />
              {tCommon('refresh')}
            </Button>
          </div>

          {/* Status tabs: Relief Pill Container */}
          <div className="flex flex-wrap items-center gap-2 mb-4 p-2 bg-[#f9f7f0] rounded-[18px] border border-[#d0d5dd]">
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
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                      : 'bg-white/80 text-[#4a5568] hover:text-[#13426f] hover:bg-white border border-[#d0d5dd]/70'
                  }`}
                >
                  <span>{tab.label}</span>
                  {count != null && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      active ? 'bg-white/25 text-white' : 'bg-[#e2e8f0] text-[#13426f]'
                    }`}>
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
              {queue.map((c) => {
                const isOverdue = c.sla?.is_overdue;
                const hoursLeft = c.sla?.remaining_seconds != null ? Math.round(c.sla.remaining_seconds / 3600) : null;
                const hasHighFreq = c.claimant_history?.frequency_risk === 'high';
                const hasFraudAlert = c.claimant_history?.has_fraud_history;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`w-full text-left p-4 rounded-[18px] border text-sm transition-all shadow-2xs ${
                      selected?.id === c.id
                        ? 'border-[#2e96ff] bg-[#eef6ff] shadow-[0_4px_0_0_rgba(154,207,246,0.5)]'
                        : 'border-[#d0d5dd] bg-white hover:border-[#2e96ff]/60 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="font-bold text-[#13426f]">{tClaims(`claimTypes.${c.claim_type}` as any)}</span>
                      {c.sla ? (
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          isOverdue
                            ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-200'
                            : hoursLeft != null && hoursLeft <= 8
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          <Clock size={11} />
                          {isOverdue ? 'Trễ SLA' : `SLA: ${hoursLeft}h`}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                          <Clock size={12} /> {fmtWait(c.waiting_seconds, { minutes: t('minutes'), hours: t('hours') })}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs text-[#4a5568]">
                      <span>{c.province ?? '—'} · <strong className="text-[#13426f] font-bold">{fmtVND(c.amount_claimed)}</strong></span>
                      {c.ai_fraud_score != null && (
                        <span className={`font-mono font-bold ${fraudColor(c.ai_fraud_score)}`}>
                          Fraud: {c.ai_fraud_score}
                        </span>
                      )}
                    </div>
                    {(hasHighFreq || hasFraudAlert || c.partner) && (
                      <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-[#d0d5dd]/50 text-[10px] flex-wrap">
                        {hasHighFreq && (
                          <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                            ⚠️ Claim thứ {c.claimant_history?.prior_claims_count ? c.claimant_history.prior_claims_count + 1 : ''}/năm
                          </span>
                        )}
                        {hasFraudAlert && (
                          <span className="bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full font-bold border border-rose-200">
                            🚨 Tiền sử nghi vấn
                          </span>
                        )}
                        {c.partner && (
                          <span className="bg-[#eef6ff] text-[#13426f] px-2 py-0.5 rounded-full font-bold border border-[#2e96ff]/20 truncate max-w-[180px]">
                            🏥 {c.partner.name}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
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
  const tFlags = useTranslations('fraudFlags');
  const toast = useToast();
  const confirm = useConfirm();

  const [note, setNote] = useState('');
  const [internalNote, setInternalNote] = useState(claim.internal_note || '');
  const [customerNotice, setCustomerNotice] = useState(claim.customer_notice || '');
  const [activeNotesTab, setActiveNotesTab] = useState<'internal' | 'customer'>('internal');

  // Itemized Adjustments
  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>(
    claim.adjustment_items && claim.adjustment_items.length > 0 ? claim.adjustment_items : []
  );

  // Partner linkage modal (Smart Hybrid Goong.io)
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [availablePartners, setAvailablePartners] = useState<any[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [partnerSearchTerm, setPartnerSearchTerm] = useState('');
  const [partnerProvinceFilter, setPartnerProvinceFilter] = useState('');
  const [partnerDistances, setPartnerDistances] = useState<Record<string, { distanceText: string; durationText: string }>>({});
  const [partnerServiceType, setPartnerServiceType] = useState<string>(
    claim.claim_type === 'health' ? 'direct_billing' : 'garage_repair'
  );
  const [partnerNotes, setPartnerNotes] = useState('');
  const [dispatchingPartner, setDispatchingPartner] = useState(false);

  const [amountApproved, setAmountApproved] = useState(claim.amount_claimed.toString());
  const [submitting, setSubmitting] = useState(false);
  const [txRef, setTxRef] = useState('');
  const [paying, setPaying] = useState(false);

  // Open an evidence/supporting doc in a new tab. Synchronous window.open (no await
  // before it) so it isn't blocked by the popup blocker; served via the backend
  // stream endpoint (cookie auth) so no MinIO-host/presigned issues.
  const openDoc = (id: string) => {
    window.open(`${API_BASE}/documents/${id}/file`, '_blank', 'noopener,noreferrer');
  };

  // Void linked policy (reviewer/admin power khi phát hiện bất thường)
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const voidLinkedPolicy = async () => {
    if (!claim.policy_id) return;
    if (voidReason.trim().length < 3) { toast.warning(t('voidReasonRequired')); return; }
    setVoiding(true);
    try {
      await api.patch(`/admin/user-policies/${claim.policy_id}/void`, { reason: voidReason.trim() });
      toast.success(t('voidSuccess'));
      setShowVoid(false);
      setVoidReason('');
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(d ?? t('voidFailed'));
    } finally { setVoiding(false); }
  };

  // Standard Reduction & Exclusion Reasons
  const REDUCTION_REASONS = [
    'Vượt trần hạn mức ngày nằm viện / tiền phòng',
    'Thuốc & vật tư ngoài danh mục bảo hiểm quy định',
    'Mức miễn thường có khấu trừ theo hợp đồng (Deductible)',
    'Khấu hao hao mòn tự nhiên đối với phụ tùng thay mới',
    'Chi phí không có hóa đơn tài chính / chứng từ hợp lệ',
    'Hạng mục hư hỏng phát sinh trước sự kiện bảo hiểm',
    'Vượt trần hạn mức trách nhiệm tối đa của gói bảo hiểm',
    'Chi phí không thuộc phạm vi bồi thường hợp đồng',
  ];

  const handleAddAdjustmentRow = () => {
    setAdjustments((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        item_name: '',
        category: 'other',
        claimed_amount: 0,
        approved_amount: 0,
        reduction_reason: '',
      },
    ]);
  };

  const handleUpdateAdjustment = (index: number, field: keyof AdjustmentItem, val: any) => {
    setAdjustments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemoveAdjustment = (index: number) => {
    setAdjustments((prev) => prev.filter((_, i) => i !== index));
  };

  const populateTemplate = (claimType: string) => {
    const total = claim.amount_claimed;
    if (claimType === 'health') {
      const room = Math.round(total * 0.4);
      const med = Math.round(total * 0.35);
      const lab = Math.max(0, total - room - med);
      setAdjustments([
        { id: '1', item_name: 'Tiền phòng & giường bệnh điều trị nội trú', category: 'room_board', claimed_amount: room, approved_amount: room, reduction_reason: '' },
        { id: '2', item_name: 'Thuốc điều trị & vật tư tiêu hao y tế', category: 'medication', claimed_amount: med, approved_amount: Math.round(med * 0.9), reduction_reason: 'Thuốc & vật tư ngoài danh mục bảo hiểm quy định' },
        { id: '3', item_name: 'Xét nghiệm máu & chẩn đoán hình ảnh (MRI/CT)', category: 'lab_test', claimed_amount: lab, approved_amount: lab, reduction_reason: '' },
      ]);
    } else if (claimType === 'vehicle') {
      const parts = Math.round(total * 0.55);
      const labor = Math.round(total * 0.35);
      const rescue = Math.max(0, total - parts - labor);
      setAdjustments([
        { id: '1', item_name: 'Phụ tùng chính hãng thay mới', category: 'parts', claimed_amount: parts, approved_amount: Math.round(parts * 0.85), reduction_reason: 'Khấu hao hao mòn tự nhiên đối với phụ tùng thay mới' },
        { id: '2', item_name: 'Tiền công phục hồi thân vỏ & sơn sấy', category: 'labor', claimed_amount: labor, approved_amount: labor, reduction_reason: '' },
        { id: '3', item_name: 'Chi phí cứu hộ kéo xe hiện trường về Garage', category: 'rescue', claimed_amount: rescue, approved_amount: rescue, reduction_reason: '' },
      ]);
    } else {
      setAdjustments([
        { id: '1', item_name: 'Thiệt hại hiện vật / tài sản thẩm định', category: 'property', claimed_amount: total, approved_amount: Math.round(total * 0.9), reduction_reason: 'Mức miễn thường có khấu trừ theo hợp đồng (Deductible)' },
      ]);
    }
    toast.success('Đã nạp mẫu bảng chi phí thẩm định!');
  };

  const handleApplyAdjustmentsTotal = () => {
    if (adjustments.length === 0) return;
    const totalApp = adjustments.reduce((sum, a) => sum + (Number(a.approved_amount) || 0), 0);
    setAmountApproved(String(totalApp));
    if (totalApp < claim.amount_claimed) {
      const firstReason = adjustments.find((a) => a.claimed_amount > a.approved_amount)?.reduction_reason;
      if (firstReason && !reductionReason) {
        setReductionReason(firstReason);
      }
    }
    toast.success(`Đã áp dụng tổng duyệt bóc tách: ${fmtVND(totalApp)}`);
  };

  const handleGenerateEOB = () => {
    const userName = claim.user?.full_name || 'Quý khách';
    const planName = claim.policy?.plan_name || 'Hợp đồng bảo hiểm';
    const policyNum = claim.policy?.policy_number || '---';
    const claimTypeVi = tClaims(`claimTypes.${claim.claim_type}` as any);
    const amountApp = parseFloat(amountApproved) || 0;
    const bankInfo = claim.bank_account
      ? `${claim.bank_account.bank_name} - STK: ${claim.bank_account.account_number} (Chủ TK: ${claim.bank_account.account_holder})`
      : 'Tài khoản ngân hàng đã đăng ký trên hồ sơ';

    const deductions = adjustments.filter((a) => a.claimed_amount > a.approved_amount);
    const reductionLines = deductions.length > 0
      ? `\nChi tiết các khoản khấu trừ nghiệp vụ:\n` +
        deductions
          .map((a) => `• ${a.item_name}: Giảm trừ ${fmtVND(a.claimed_amount - a.approved_amount)} (Lý do: ${a.reduction_reason || 'Quy tắc hợp đồng'})`)
          .join('\n')
      : reductionReason
      ? `\nCăn cứ giảm trừ: ${reductionReason}`
      : '';

    const text = `Kính gửi Quý khách ${userName},

Công ty Bảo hiểm xin trân trọng thông báo kết quả giải quyết quyền lợi bảo hiểm cho hồ sơ bồi thường mã [${claim.id}] thuộc gói ${planName} (Số HĐ: ${policyNum}).

Căn cứ quy tắc bảo hiểm và các chứng từ thực tế Quý khách đã cung cấp đối với sự kiện bảo hiểm ${claimTypeVi}:
- Tổng số tiền bồi thường yêu cầu: ${fmtVND(claim.amount_claimed)}
- Số tiền bảo hiểm chấp thuận chi trả: ${fmtVND(amountApp)}${reductionLines}

Khoản tiền bồi thường đã duyệt sẽ được tiến hành chuyển khoản giải ngân theo thông tin thụ hưởng:
${bankInfo}

Nếu có bất kỳ câu hỏi nào cần giải đáp thêm, Quý khách vui lòng liên hệ Trung tâm dịch vụ khách hàng 24/7 để được hỗ trợ chu đáo.
Trân trọng cảm ơn Quý khách!`;

    setCustomerNotice(text);
    setActiveNotesTab('customer');
    toast.success('Đã tạo bản dự thảo Thư giải quyết quyền lợi (EOB) chuẩn!');
  };

  const handleOpenPartnerModal = async () => {
    setPartnerModalOpen(true);
    setLoadingPartners(true);
    setSelectedPartnerId('');
    setPartnerSearchTerm('');
    setPartnerProvinceFilter('');
    setPartnerDistances({});

    try {
      // 1. Fetch hybrid recommendations (InsurTech policy type + Geo distance)
      const res = await api.get<{ target_type: string; recommendations: any[] }>(
        `/geo-risk/guarantee-recommendations?claim_id=${claim.id}&claim_type=${claim.claim_type}`
      );
      const items = res.data.recommendations || [];
      setAvailablePartners(items);
      if (items.length > 0) {
        setSelectedPartnerId(items[0].id);
      }

      // 2. Compute accurate Goong road distance & duration for top partners if location is available
      const originLat = claim.incident_location?.lat;
      const originLng = claim.incident_location?.lng;
      if (originLat && originLng) {
        const top5 = items.slice(0, 5);
        const distMap: Record<string, { distanceText: string; durationText: string }> = {};
        await Promise.all(
          top5.map(async (p: any) => {
            if (p.lat && p.lng) {
              try {
                const dm = await getDistanceMatrixGoong(
                  { lat: originLat, lng: originLng },
                  { lat: p.lat, lng: p.lng }
                );
                if (dm) {
                  distMap[p.id] = {
                    distanceText: dm.distanceText,
                    durationText: dm.durationText,
                  };
                }
              } catch {
                // ignore matrix error for individual partner
              }
            }
          })
        );
        setPartnerDistances(distMap);
      }
    } catch {
      // Fallback
      try {
        const typeFilter = claim.claim_type === 'health' ? 'hospital' : 'garage';
        const res2 = await api.get<{ items: any[] }>(`/admin/partners?partner_type=${typeFilter}`);
        const fallbackItems = res2.data.items || [];
        setAvailablePartners(fallbackItems);
        if (fallbackItems.length > 0) setSelectedPartnerId(fallbackItems[0].id);
      } catch {
        setAvailablePartners([]);
      }
    } finally {
      setLoadingPartners(false);
    }
  };

  const handleDispatchPartner = async () => {
    if (!selectedPartnerId) return;
    setDispatchingPartner(true);
    try {
      await api.post('/admin/partners/dispatch', {
        claim_id: claim.id,
        partner_id: selectedPartnerId,
        service_type: partnerServiceType,
        notes: partnerNotes.trim() || null,
      });
      toast.success('Đã phát lệnh điều phối & kích hoạt bảo lãnh trực tiếp!');
      setPartnerModalOpen(false);
      onDone();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Lỗi điều phối đối tác');
    } finally {
      setDispatchingPartner(false);
    }
  };

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
        internal_note: internalNote.trim() || null,
        customer_notice: customerNotice.trim() || null,
        adjustment_items: adjustments,
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

      {/* ── SLA Countdown & Milestones Banner ── */}
      <div className="rounded-[22px] border border-[#d0d5dd] bg-[#13426f] p-5 text-white shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/15">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-xs ${
              claim.sla?.is_overdue
                ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                : 'bg-white/10 text-[#2e96ff] border border-white/20'
            }`}>
              <Clock size={19} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/80">
                  Cam kết thời hạn xử lý (SLA: {claim.sla?.sla_hours ?? 48}h)
                </span>
                {claim.sla?.is_overdue ? (
                  <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs animate-pulse">
                    QUÁ HẠN CAM KẾT
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    TRONG HẠN SLA
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                {claim.sla?.is_overdue ? (
                  <span className="text-rose-300 font-semibold">
                    Đã quá hạn {Math.abs(Math.round((claim.sla?.remaining_seconds ?? 0) / 3600))} giờ so với cam kết dịch vụ! Cần ưu tiên giải quyết ngay.
                  </span>
                ) : claim.sla?.remaining_seconds != null ? (
                  <>
                    Thời gian còn lại:{' '}
                    <strong className="text-emerald-300 font-mono">
                      {Math.floor(claim.sla.remaining_seconds / 3600)} giờ {Math.floor((claim.sla.remaining_seconds % 3600) / 60)} phút
                    </strong>{' '}
                    (Hạn chót: {claim.sla.sla_deadline ? new Date(claim.sla.sla_deadline).toLocaleString('vi-VN') : '—'})
                  </>
                ) : (
                  'Đang theo dõi tiến trình xử lý'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Milestone Steps */}
        <div className="grid grid-cols-4 gap-2.5 mt-3.5 bg-white/5 rounded-[16px] p-3 border border-white/10 text-[11px]">
          <div className="flex flex-col">
            <span className="text-white/60">1. Tiếp nhận</span>
            <span className="font-semibold text-emerald-300">✓ Đã nộp</span>
            <span className="text-[10px] text-white/50 font-mono truncate">{new Date(claim.created_at).toLocaleDateString('vi-VN')}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-white/60">2. AI OCR/Vision</span>
            <span className="font-semibold text-emerald-300">
              {claim.ai_decision ? '✓ Đã phân tích' : 'Đang quét'}
            </span>
            <span className="text-[10px] text-white/50 font-mono">
              {claim.ai_fraud_score != null ? `Risk: ${claim.ai_fraud_score}/100` : ''}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-white/60">3. Giám định viên</span>
            <span className={`font-semibold ${claim.reviewer_id ? 'text-emerald-300' : 'text-amber-300 font-bold'}`}>
              {claim.reviewer_id ? '✓ Đã thụ lý' : '● Chờ xử lý'}
            </span>
            <span className="text-[10px] text-white/50 font-mono truncate">
              {claim.reviewer_id ? 'Đã gán Reviewer' : 'Hàng đợi'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-white/60">4. Ký duyệt chi</span>
            <span className={`font-semibold ${
              claim.status === 'approved' ? 'text-emerald-300'
              : claim.status === 'rejected' ? 'text-rose-300'
              : 'text-white/70'
            }`}>
              {claim.status === 'approved' ? '✓ Đã duyệt'
               : claim.status === 'rejected' ? '✗ Từ chối'
               : 'Chờ quyết định'}
            </span>
            <span className="text-[10px] text-white/50 font-mono">
              {claim.amount_approved ? fmtVND(claim.amount_approved) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* User & Claimant 12-Month History */}
      <Section title={t('sectionUser')} icon={UserIcon}>
        {claim.user ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoCell label={t('userName')} value={claim.user.full_name ?? '—'} />
              <InfoCell label={t('userEmail')} value={claim.user.email} />
              {claim.user.phone && <InfoCell label={t('userPhone')} value={claim.user.phone} />}
              <InfoCell label={tClaims('province')} value={claim.user.province ?? '—'} />
            </div>

            {/* 12-Month Claims Profile */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <History size={13} className="text-blue-600" />
                  Lịch sử Bồi thường 12 Tháng của Khách hàng:
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  claim.claimant_history?.frequency_risk === 'high'
                    ? 'bg-rose-100 text-rose-800'
                    : claim.claimant_history?.frequency_risk === 'moderate'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  Tần suất: {claim.claimant_history?.frequency_risk === 'high' ? 'Cao bất thường' : claim.claimant_history?.frequency_risk === 'moderate' ? 'Trung bình' : 'Bình thường'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-200">
                <div>
                  <span className="text-slate-500 block">Số vụ 12 tháng qua:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {claim.claimant_history?.prior_claims_count ?? 0} vụ
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Đã được bồi thường:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {fmtVND(claim.claimant_history?.prior_total_paid ?? 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    ({claim.claimant_history?.prior_approved_count ?? 0} vụ duyệt)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Hồ sơ từng bị từ chối:</span>
                  <span className={`font-bold font-mono ${
                    (claim.claimant_history?.prior_rejected_count ?? 0) > 0 ? 'text-rose-600' : 'text-slate-700'
                  }`}>
                    {claim.claimant_history?.prior_rejected_count ?? 0} vụ
                  </span>
                </div>
              </div>

              {/* Alerts */}
              {claim.claimant_history?.frequency_risk === 'high' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2 text-[11px] flex items-center gap-1.5 font-medium">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>Cảnh báo: Khách hàng nộp nhiều hồ sơ trong thời gian ngắn (&ge;4 vụ/năm). Đề nghị đối soát kỹ số hóa đơn và hiện trường để tránh trục lợi lặp!</span>
                </div>
              )}
              {claim.claimant_history?.has_fraud_history && (
                <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-lg p-2 text-[11px] flex items-center gap-1.5 font-medium">
                  <ShieldAlert size={14} className="text-rose-600 shrink-0" />
                  <span>Phát hiện rủi ro: Khách hàng từng có hồ sơ trước bị từ chối hoặc gắn cờ gian lận (&ge;70 điểm)!</span>
                </div>
              )}
            </div>
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

          {claim.policy.insured_person?.name && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500 font-semibold mb-1.5 flex items-center gap-1.5">
                <CheckCircle size={13} className="text-emerald-600" />
                Đối tượng được bảo hiểm (Thụ hưởng):
              </p>
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Họ và tên:</span>
                  <span className="font-bold text-gray-900">
                    {claim.policy.insured_person.name} ({getRelationshipLabel(claim.policy.insured_person.relationship)})
                  </span>
                </div>
                {(claim.policy.insured_person.dob || claim.policy.insured_person.id_number) && (
                  <div className="flex justify-between text-gray-600">
                    <span>CCCD / Ngày sinh:</span>
                    <span className="font-mono">
                      {[claim.policy.insured_person.id_number, claim.policy.insured_person.dob].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                )}
                {claim.policy.insured_person.relationship !== 'self' && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-100 rounded px-2 py-0.5 mt-1 font-medium">
                    ⚠️ Lưu ý thẩm định: Đây là gói mua cho người thân. Cần đối chiếu chứng từ y tế / thiệt hại với tên <strong>{claim.policy.insured_person.name}</strong>.
                  </p>
                )}
              </div>
            </div>
          )}

          {claim.policy.subject_details && Object.keys(claim.policy.subject_details).length > 0 && (
            <div className="mt-2 pt-2 border-t text-xs space-y-1">
              <p className="text-gray-500 font-semibold mb-1">Chi tiết tài sản / phương tiện / rủi ro:</p>
              {claim.policy.subject_details.license_plate && (
                <p className="text-gray-800">🚗 Biển số: <strong>{claim.policy.subject_details.license_plate}</strong> {[claim.policy.subject_details.brand, claim.policy.subject_details.model].filter(Boolean).join(' ')}</p>
              )}
              {claim.policy.subject_details.address && (
                <p className="text-gray-800">🏠 Địa chỉ tài sản: <strong>{claim.policy.subject_details.address}</strong></p>
              )}
              {claim.policy.subject_details.disaster_plan && (
                <p className="text-gray-800">🌪️ Gói thiên tai: <strong>{claim.policy.subject_details.disaster_plan}</strong></p>
              )}
            </div>
          )}

          {/* Void power — reviewer/admin vô hiệu hoá gói nếu phát hiện bất thường */}
          {claim.policy_id && (
            <div className="mt-3 pt-3 border-t">
              {!showVoid ? (
                <button
                  onClick={() => setShowVoid(true)}
                  className="text-xs text-purple-700 hover:text-purple-900 inline-flex items-center gap-1"
                >
                  <Ban size={13} /> {t('voidLinkedPolicy')}
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                    <Ban size={13} /> {t('voidLinkedPolicy')}
                  </p>
                  <textarea
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    rows={2}
                    placeholder={t('voidReasonPh')}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowVoid(false); setVoidReason(''); }}
                      disabled={voiding}
                      className="text-xs px-3 py-1.5 rounded-md border hover:bg-gray-50"
                    >
                      {tCommon('cancel')}
                    </button>
                    <button
                      onClick={voidLinkedPolicy}
                      disabled={voiding}
                      className="text-xs px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700 inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      {voiding ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                      {t('voidConfirm')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
                  <li key={d.id}>
                    <DocButton d={d} accent="text-amber-600" onOpen={() => openDoc(d.id)} viewLabel={t('viewFile')} />
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
                  <li key={d.id}>
                    <DocButton d={d} accent="text-gray-500" onOpen={() => openDoc(d.id)} viewLabel={t('viewFile')} />
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
              {claim.ai_fraud_flags.map((f, i) => (<li key={i}>• {fraudFlagLabel(f, tFlags)}</li>))}
            </ul>
          )}
          {claim.ai_reasoning && (
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{claim.ai_reasoning}</p>
          )}
        </div>
      </details>

      {/* AI Vision Damage Assessment from Photos */}
      {claim.damage_assessment && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-indigo-950 flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-600" />
              AI Vision Giám định tổn thất hiện trường
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
              claim.damage_assessment.severity_level === 'minor'
                ? 'bg-emerald-100 text-emerald-800'
                : claim.damage_assessment.severity_level === 'moderate'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-red-100 text-red-800'
            }`}>
              Mức độ: {claim.damage_assessment.severity_level} ({claim.damage_assessment.severity_percentage}%)
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Hư hại kết cấu / hiện trường</span>
              <span className="font-bold text-gray-800">{claim.damage_assessment.severity_percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${claim.damage_assessment.severity_percentage}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-lg border border-indigo-100">
            <div>
              <span className="text-gray-500 block">Dải chi phí ước tính:</span>
              <span className="font-bold text-gray-800 font-mono">
                {claim.damage_assessment.estimated_cost_min.toLocaleString('vi-VN')} – {claim.damage_assessment.estimated_cost_max.toLocaleString('vi-VN')} đ
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">AI khuyến nghị duyệt:</span>
              <span className="font-bold text-emerald-700 font-mono">
                {claim.damage_assessment.recommended_amount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>

          {claim.damage_assessment.detected_items && claim.damage_assessment.detected_items.length > 0 && (
            <div className="text-[11px] text-gray-600 space-y-0.5">
              <span className="font-semibold text-gray-700">Hạng mục tổn thất ghi nhận:</span>
              <div className="flex flex-wrap gap-1">
                {claim.damage_assessment.detected_items.map((it, idx) => (
                  <span key={idx} className="bg-white border px-1.5 py-0.5 rounded text-gray-700">
                    {it}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] text-gray-600 italic bg-white/80 p-2 rounded border border-indigo-50">
            &ldquo;{claim.damage_assessment.summary_vi}&rdquo;
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-700 font-medium">
            <span>✓ Chống gian lận: {claim.damage_assessment.fraud_check.is_suspicious ? 'Phát hiện nghi vấn' : 'Không có dấu hiệu gian lận'}</span>
            <span>Tin cậy: {Math.round((1 - claim.damage_assessment.fraud_check.risk_score) * 100)}%</span>
          </div>
        </div>
      )}

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

      {/* ── Partner Network Guarantee & Direct Billing (Tích hợp Mạng lưới Đối tác) ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Building2 size={14} className="text-blue-600" />
            Bảo lãnh Trực tiếp & Đối tác Liên kết (Cashless Network)
          </span>
          {claim.partner ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <CheckCircle size={10} /> ĐÃ KÍCH HOẠT BẢO LÃNH
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenPartnerModal}
              className="h-7 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50 gap-1"
            >
              <Hospital size={12} />
              {claim.claim_type === 'health' ? 'Chỉ định Bệnh viện bảo lãnh' : 'Chỉ định Garage liên kết'}
            </Button>
          )}
        </div>

        {claim.partner ? (
          <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  {claim.partner.partner_type === 'hospital' ? <Hospital size={14} className="text-emerald-600" /> : <Wrench size={14} className="text-blue-600" />}
                  {claim.partner.name}
                </p>
                <p className="text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPin size={11} /> {claim.partner.address}, {claim.partner.province}
                </p>
              </div>
              <span className="font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 font-bold">
                {claim.partner.guarantee_status === 'guaranteed' ? 'Đã duyệt bảo lãnh' : 'Đang điều phối'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-200/50 text-[11px] text-slate-600">
              <div>
                <span>Dịch vụ: </span>
                <strong className="text-slate-800">
                  {claim.partner.service_type === 'direct_billing' ? 'Bảo lãnh viện phí trực tiếp'
                   : claim.partner.service_type === 'garage_repair' ? 'Sửa chữa phụ tùng Garage liên kết'
                   : 'Cứu hộ khẩn cấp'}
                </strong>
              </div>
              <div>
                <span>Hotline hỗ trợ: </span>
                <strong className="text-blue-700 font-mono">{claim.partner.hotline || claim.partner.phone}</strong>
              </div>
            </div>
            {claim.partner.notes && (
              <p className="text-[11px] text-slate-600 italic bg-white p-1.5 rounded border border-blue-100">
                Ghi chú điều phối: &ldquo;{claim.partner.notes}&rdquo;
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            Hồ sơ chưa kích hoạt bảo lãnh viện phí trực tiếp hoặc liên kết Garage. Thẩm định viên có thể phát lệnh chỉ định đối tác để khách hàng không cần ứng trước tiền mặt.
          </p>
        )}
      </div>

      {/* ── BẢNG BÓC TÁCH CHI PHÍ THẨM ĐỊNH (Itemized Claims Adjustment Sheet) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Scale size={16} className="text-blue-600" />
              Bảng Bóc Tách Chi Phí Thẩm Định & Khấu Trừ (Adjustment Sheet)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Bóc tách từng dòng hóa đơn thực tế, áp dụng quy tắc miễn thường và trích xuất số tiền chi trả chuẩn xác
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => populateTemplate(claim.claim_type as any)}
              className="h-7 text-xs text-slate-700 hover:bg-slate-100 gap-1"
            >
              <Sparkles size={12} className="text-indigo-600" />
              Nạp mẫu {claim.claim_type === 'health' ? 'Viện phí' : claim.claim_type === 'vehicle' ? 'Sửa chữa xe' : 'Thiệt hại'}
            </Button>
            <Button
              size="sm"
              onClick={handleAddAdjustmentRow}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
            >
              <Plus size={12} /> Thêm dòng
            </Button>
          </div>
        </div>

        {/* Adjustments Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-slate-500 font-bold uppercase text-[10px] tracking-wider text-left">
                <th className="pb-2">Hạng mục chi phí</th>
                <th className="pb-2 text-right w-28">Yêu cầu (đ)</th>
                <th className="pb-2 text-right w-28">Duyệt chi (đ)</th>
                <th className="pb-2 pl-3">Căn cứ giảm trừ / Loại trừ</th>
                <th className="pb-2 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2 pr-2">
                    <Input
                      value={row.item_name}
                      onChange={(e) => handleUpdateAdjustment(idx, 'item_name', e.target.value)}
                      placeholder="Tên mục chi phí..."
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      type="number"
                      value={row.claimed_amount}
                      onChange={(e) => handleUpdateAdjustment(idx, 'claimed_amount', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-right font-mono"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <Input
                      type="number"
                      value={row.approved_amount}
                      onChange={(e) => handleUpdateAdjustment(idx, 'approved_amount', parseFloat(e.target.value) || 0)}
                      className={`h-7 text-xs text-right font-mono font-bold ${
                        row.approved_amount < row.claimed_amount ? 'text-amber-700 bg-amber-50/50' : 'text-emerald-700'
                      }`}
                    />
                  </td>
                  <td className="py-2 pl-3 pr-1">
                    <select
                      value={row.reduction_reason || ''}
                      onChange={(e) => handleUpdateAdjustment(idx, 'reduction_reason', e.target.value)}
                      className="h-7 w-full text-xs rounded border bg-white px-2 text-slate-700"
                    >
                      <option value="">-- Duyệt đủ 100% --</option>
                      {REDUCTION_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => handleRemoveAdjustment(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Xóa dòng"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {adjustments.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400 italic">
                    Chưa bóc tách chi tiết. Bấm &ldquo;Thêm dòng&rdquo; hoặc &ldquo;Nạp mẫu&rdquo; để lập bảng phân bổ chi phí.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Live Calculation Footer */}
        {adjustments.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-slate-500">Tổng yêu cầu: </span>
                <span className="font-mono font-bold text-slate-800">
                  {fmtVND(adjustments.reduce((sum, a) => sum + (Number(a.claimed_amount) || 0), 0))}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Tổng giảm trừ: </span>
                <span className="font-mono font-bold text-rose-600">
                  -{fmtVND(adjustments.reduce((sum, a) => sum + Math.max(0, (Number(a.claimed_amount) || 0) - (Number(a.approved_amount) || 0)), 0))}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Số tiền duyệt thực tế: </span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  {fmtVND(adjustments.reduce((sum, a) => sum + (Number(a.approved_amount) || 0), 0))}
                </span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleApplyAdjustmentsTotal}
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-xs"
            >
              <CheckCircle size={12} /> Áp dụng vào Quyết định duyệt
            </Button>
          </div>
        )}
      </div>

      {/* ── HỆ THỐNG GHI CHÚ KÉP (Dual Notes: Internal Memo vs Customer EOB) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <h4 className="font-bold text-slate-900 text-sm">
              Hệ Thống Ghi Chú & Thông Báo Bồi Thường
            </h4>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setActiveNotesTab('internal')}
              className={`px-3 py-1 rounded-md font-bold transition-colors ${
                activeNotesTab === 'internal'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🔒 Ghi chú Nội bộ
            </button>
            <button
              onClick={() => setActiveNotesTab('customer')}
              className={`px-3 py-1 rounded-md font-bold transition-colors ${
                activeNotesTab === 'customer'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ✉️ Thư gửi Khách hàng (EOB)
            </button>
          </div>
        </div>

        {activeNotesTab === 'internal' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Ý kiến nghiệp vụ, căn cứ kỹ thuật (Chỉ Giám định viên, Trưởng phòng & Admin đọc được):</span>
              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono">Bảo mật nội bộ</span>
            </div>
            <textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={3}
              placeholder="Nhập ghi chú thẩm định nội bộ, phát hiện rủi ro hoặc lý do chỉ đạo chuyên môn..."
              className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Nội dung gửi thông báo giải quyết quyền lợi (Explanation of Benefits) tới người dùng:</span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateEOB}
                className="h-6 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 font-bold gap-1"
              >
                <Sparkles size={11} /> Tạo thư mẫu tự động
              </Button>
            </div>
            <textarea
              value={customerNotice}
              onChange={(e) => setCustomerNotice(e.target.value)}
              rows={5}
              placeholder="Thư thông báo quyền lợi giải thích lý do duyệt/giảm trừ/từ chối gửi đến ứng dụng của khách hàng..."
              className="w-full text-xs font-mono rounded-xl border border-slate-200 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50 leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* ── Smart Hybrid Partner Linkage Modal (Goong.io GIS + Cashless Network) ── */}
      {partnerModalOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4" onClick={() => setPartnerModalOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white p-4 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur-xs border border-white/20 flex items-center justify-center text-white shrink-0">
                  {claim.claim_type === 'health' ? <Hospital size={18} /> : <Wrench size={18} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                    {claim.claim_type === 'health' ? 'Chỉ định Bệnh viện Bảo lãnh viện phí' : 'Chỉ định Garage Sửa chữa liên kết'}
                    <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded-full font-bold">
                      HYBRID GIS
                    </span>
                  </h3>
                  <p className="text-[11px] text-blue-100 flex items-center gap-1 mt-0.5">
                    <MapPin size={11} className="text-amber-300" />
                    Hiện trường: <span className="font-semibold text-white">{claim.incident_location?.address || claim.province || 'Toàn quốc'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPartnerModalOpen(false)}
                className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              
              {/* Search & Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Tìm theo tên bệnh viện, garage, địa chỉ..."
                    value={partnerSearchTerm}
                    onChange={(e) => setPartnerSearchTerm(e.target.value)}
                    className="h-8.5 pl-9 text-xs rounded-xl border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div>
                  <select
                    value={partnerProvinceFilter}
                    onChange={(e) => setPartnerProvinceFilter(e.target.value)}
                    className="w-full h-8.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Tất cả 63 tỉnh thành --</option>
                    {PROVINCES.map((pr) => (
                      <option key={pr} value={pr}>{pr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Partner Card Recommendations */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Building2 size={13} className="text-blue-600" />
                    Cơ sở bảo lãnh đủ điều kiện hợp đồng:
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Đã xếp hạng theo khoảng cách Goong
                  </span>
                </div>

                {loadingPartners ? (
                  <div className="py-8 text-center space-y-2">
                    <Loader2 className="animate-spin inline text-blue-600" size={24} />
                    <p className="text-slate-500 text-xs">Đang phân tích mạng lưới đối tác & cự ly Goong...</p>
                  </div>
                ) : (() => {
                  const filtered = availablePartners.filter((p) => {
                    const matchSearch = !partnerSearchTerm.trim() ||
                      p.name?.toLowerCase().includes(partnerSearchTerm.toLowerCase()) ||
                      p.address?.toLowerCase().includes(partnerSearchTerm.toLowerCase()) ||
                      p.province?.toLowerCase().includes(partnerSearchTerm.toLowerCase());
                    const matchProv = !partnerProvinceFilter || p.province?.toLowerCase().includes(partnerProvinceFilter.toLowerCase());
                    return matchSearch && matchProv;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 space-y-1">
                        <AlertCircle size={24} className="mx-auto text-amber-500 mb-1" />
                        <p className="font-bold text-slate-700">Không tìm thấy cơ sở bảo lãnh phù hợp bộ lọc</p>
                        <p className="text-[11px]">Vui lòng thử chọn tỉnh thành lân cận hoặc xoá từ khoá tìm kiếm.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {filtered.map((p, idx) => {
                        const isSelected = selectedPartnerId === p.id;
                        const distInfo = partnerDistances[p.id];
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedPartnerId(p.id)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                              isSelected
                                ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                : 'bg-slate-50/50 hover:bg-slate-100/70 border-slate-200'
                            }`}
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                  p.partner_type === 'hospital'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : p.partner_type === 'garage'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {p.partner_type === 'hospital' ? 'Bệnh viện liên kết' : p.partner_type === 'garage' ? 'Garage chính hãng' : 'Đội cứu hộ 24/7'}
                                </span>
                                {idx === 0 && (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-md">
                                    🥇 Tối ưu nhất
                                  </span>
                                )}
                                <span className="font-bold text-slate-900 text-xs truncate">
                                  {p.name}
                                </span>
                              </div>

                              <p className="text-slate-600 text-[11px] flex items-center gap-1 truncate">
                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                {p.address}, {p.province}
                              </p>

                              <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 flex-wrap">
                                {distInfo ? (
                                  <span className="font-semibold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded font-mono flex items-center gap-1">
                                    ⚡ {distInfo.distanceText} · ~{distInfo.durationText} lái xe
                                  </span>
                                ) : p.distance_km != null ? (
                                  <span className="font-semibold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded font-mono">
                                    📍 Cách ~{p.distance_km} km
                                  </span>
                                ) : null}

                                <span className="flex items-center gap-0.5 text-amber-700 font-bold">
                                  <Star size={11} className="fill-amber-400 text-amber-400" />
                                  {p.rating || 4.9}
                                </span>

                                <span className="text-slate-600 flex items-center gap-1 font-mono">
                                  <Phone size={10} />
                                  {p.hotline || p.phone}
                                </span>

                                {p.cashless_supported && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                    ✓ Bảo lãnh trực tiếp (e-GOP)
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 pt-1">
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                              }`}>
                                {isSelected && <CheckCircle size={13} className="text-white" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Service & Guarantee Notes Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <Label className="text-xs font-bold text-slate-800 mb-1.5 block">Loại hình bảo lãnh nghiệp vụ:</Label>
                  <select
                    value={partnerServiceType}
                    onChange={(e) => setPartnerServiceType(e.target.value)}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="direct_billing">Bảo lãnh viện phí trực tiếp (Direct Billing GOP)</option>
                    <option value="garage_repair">Bảo lãnh sửa chữa tại Garage chính hãng</option>
                    <option value="rescue_dispatch">Điều xe cứu hộ hiện trường khẩn cấp 24/7</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-800 mb-1.5 block">Hạn mức cam kết / Ghi chú nghiệp vụ:</Label>
                  <Input
                    value={partnerNotes}
                    onChange={(e) => setPartnerNotes(e.target.value)}
                    placeholder="VD: Cam kết bảo lãnh viện phí trần 30.000.000 đ..."
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 italic">
                {selectedPartnerId ? '✓ Đã chọn đối tác bảo lãnh' : 'Vui lòng chọn 1 cơ sở từ danh sách'}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPartnerModalOpen(false)}
                  className="rounded-xl border-slate-200 text-slate-700 hover:bg-white font-bold px-4"
                >
                  Hủy bỏ
                </Button>
                <Button
                  size="sm"
                  onClick={handleDispatchPartner}
                  disabled={!selectedPartnerId || dispatchingPartner}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 px-5 shadow-sm cursor-pointer"
                >
                  {dispatchingPartner ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  Kích hoạt Bảo lãnh & Cấp e-GOP
                </Button>
              </div>
            </div>

          </div>
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
        // AI auto-approved (no human yet) → không cần xét lại; chỉ Thu hồi hoặc Vô hiệu gói
        const aiAutoApproved = !claim.reviewer_id && isApproved;

        if (aiAutoApproved) {
          return (
            <div className="border-t pt-4 space-y-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={16} className="text-green-600" />
                  <p className="font-semibold text-sm text-green-800">{t('aiAutoApproved')}</p>
                </div>
                {claim.amount_approved != null && (
                  <p className="text-xs text-gray-700">
                    {t('amountApproved')}: <span className="font-semibold">{fmtVND(claim.amount_approved)}</span>
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-1">{t('aiAutoApprovedHint')}</p>
              </div>
              <div>
                <Label>{t('note')}</Label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full h-16 px-3 py-2 rounded-md border text-sm"
                  placeholder={t('revokeNotePh')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onClose} disabled={submitting} className="px-3 text-xs">
                  {tCommon('cancel')}
                </Button>
                <Button
                  onClick={() => decide('rejected')}
                  disabled={submitting}
                  variant="destructive"
                  className="flex-1 text-xs"
                >
                  {submitting ? <Loader2 className="animate-spin mr-1" size={12} /> : <X size={12} className="mr-1" />}
                  {t('revokeApprovalBtn')}
                </Button>
              </div>
              <p className="text-xs text-gray-400 italic">{t('voidHintInPolicy')}</p>
            </div>
          );
        }

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
                {claim.internal_note && (
                  <div className="mt-2 pt-2 border-t border-current/10">
                    <p className="text-xs font-semibold text-slate-700 mb-0.5 flex items-center gap-1">
                      🔒 Ghi chú thẩm định nội bộ:
                    </p>
                    <p className="text-xs text-slate-600 bg-white/70 p-2 rounded border whitespace-pre-wrap">{claim.internal_note}</p>
                  </div>
                )}
                {claim.customer_notice && (
                  <div className="mt-2 pt-2 border-t border-current/10">
                    <p className="text-xs font-semibold text-blue-800 mb-0.5 flex items-center gap-1">
                      ✉️ Thư thông báo quyền lợi (EOB) đã gửi khách hàng:
                    </p>
                    <p className="text-xs text-slate-700 bg-white/70 p-2 rounded border font-mono whitespace-pre-wrap">{claim.customer_notice}</p>
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
            <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{t('amountApproved')}</Label>
            <Input
              type="number"
              value={amountApproved}
              onChange={(e) => setAmountApproved(e.target.value)}
              className="text-xs h-9 font-bold text-[#13426f] rounded-full border border-[#d0d5dd] bg-white px-3.5 focus:border-[#2e96ff]"
            />
            <p className="text-[11px] text-[#616c8a] mt-1">{t('amountClaimedHint')}: <span className="font-bold text-[#13426f]">{fmtVND(claim.amount_claimed)}</span></p>
          </div>

          {/* Partial approval — show reduction_reason input only if amount < claimed */}
          {parseFloat(amountApproved) > 0 && parseFloat(amountApproved) < claim.amount_claimed && (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50/70 p-3.5 space-y-2">
              <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-600" /> {t('partialDetectedHint')}
              </p>
              <textarea
                value={reductionReason}
                onChange={(e) => setReductionReason(e.target.value)}
                placeholder={t('reductionReasonPh')}
                className="w-full h-16 p-2.5 rounded-[14px] border border-amber-200 bg-white text-xs text-[#13426f] focus:outline-none focus:border-[#2e96ff] resize-none"
              />
            </div>
          )}

          <div>
            <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{t('note')}</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-20 p-3 rounded-[16px] border border-[#d0d5dd] text-xs text-[#13426f] bg-white focus:outline-none focus:border-[#2e96ff] resize-none"
              placeholder={t('note')}
            />
          </div>

          {/* Fields needed input — only relevant for Request Info */}
          <details className="rounded-[18px] border border-orange-200 bg-orange-50/60 p-3.5">
            <summary className="cursor-pointer text-xs font-bold text-orange-800 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-orange-600" /> {t('fieldsNeededTitle')}
            </summary>
            <textarea
              value={fieldsNeededRaw}
              onChange={(e) => setFieldsNeededRaw(e.target.value)}
              placeholder={t('fieldsNeededPh')}
              className="mt-2.5 w-full h-20 p-2.5 rounded-[14px] border border-orange-200 bg-white text-xs text-[#13426f] focus:outline-none focus:border-[#2e96ff] resize-none"
            />
            <p className="text-[11px] text-[#616c8a] mt-1.5">{t('fieldsNeededHint')}</p>
          </details>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="px-4 text-xs font-semibold rounded-full border-[#d0d5dd] text-gray-700 hover:bg-gray-50"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={() => decide(
                parseFloat(amountApproved) > 0 && parseFloat(amountApproved) < claim.amount_claimed
                  ? 'partial_approved' : 'approved'
              )}
              disabled={submitting}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-full shadow-[0_3px_0_0_rgba(16,185,129,0.4)] active:translate-y-[1px] active:shadow-xs transition-all"
            >
              {submitting ? <Loader2 className="animate-spin mr-1.5" size={13} /> : <CheckCircle size={13} className="mr-1.5" />}
              {parseFloat(amountApproved) > 0 && parseFloat(amountApproved) < claim.amount_claimed
                ? t('partialBtn') : t('approve')}
            </Button>
            <Button
              onClick={() => decide('info_requested')}
              disabled={submitting}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-full shadow-[0_3px_0_0_rgba(245,158,11,0.4)] active:translate-y-[1px] active:shadow-xs transition-all"
            >
              {submitting ? <Loader2 className="animate-spin mr-1.5" size={13} /> : <AlertTriangle size={13} className="mr-1.5" />}
              {t('requestInfoBtn')}
            </Button>
            <Button
              onClick={() => decide('rejected')}
              disabled={submitting}
              variant="destructive"
              className="flex-1 text-xs font-bold rounded-full shadow-[0_3px_0_0_rgba(225,29,72,0.4)] active:translate-y-[1px] active:shadow-xs transition-all"
            >
              {submitting ? <Loader2 className="animate-spin mr-1.5" size={13} /> : <X size={13} className="mr-1.5" />}
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
    accent === 'orange' ? 'text-amber-600' :
    accent === 'blue'   ? 'text-[#2e96ff]'   :
    accent === 'green'  ? 'text-emerald-600'  :
    accent === 'red'    ? 'text-rose-600'    : 'text-[#13426f]';
  return (
    <div className="bg-white border border-[#d0d5dd] rounded-2xl p-4 sm:p-5 shadow-xs hover:border-[#2e96ff] transition-all overflow-hidden flex flex-col justify-between">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={14} className={color} />}
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
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
  return (
    <div className="rounded-[18px] border border-[#d0d5dd] p-4 bg-white shadow-2xs">
      <p className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 text-[#13426f]">
        <Icon size={14} className="text-[#2e96ff]" /> {title}
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

function DocButton({ d, accent, onOpen, viewLabel }: {
  d: { id: string; doc_type: string; file_name: string };
  accent: string;
  onOpen: () => void;
  viewLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={viewLabel}
      className="group w-full flex items-center gap-2 text-left rounded-md px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-950/30"
    >
      <FileText size={12} className={`${accent} shrink-0`} />
      <span className="truncate text-blue-700 group-hover:underline">{d.file_name}</span>
      <span className="text-xs text-gray-400 shrink-0">({d.doc_type})</span>
      <ExternalLink size={11} className="ml-auto shrink-0 text-gray-400" />
    </button>
  );
}
