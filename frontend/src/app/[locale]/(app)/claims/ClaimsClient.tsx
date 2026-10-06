'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, Building2, Calendar, Check, CheckCircle, ChevronRight, Clock,
  CreditCard, Download, ExternalLink, FileCheck, FileText, Hospital, Loader2,
  MapPin, Navigation, Phone, Plus, QrCode, ShieldAlert, ShieldCheck, Sparkles,
  Trash2, Upload, User as UserIcon, Wrench, X,
} from 'lucide-react';
// ShieldAlert kept for DetailModal fraud section
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import { fraudFlagLabel } from '@/lib/fraudFlags';
import { getPolicySubjectLabel, getRelationshipLabel } from '@/lib/policy-helpers';
import { ClaimSubmitWizard } from '@/components/claims/ClaimSubmitWizard';
import type { Claim, DocumentRecord, UserPolicy } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES = ['pending', 'processing', 'approved', 'rejected', 'manual_review', 'info_requested'] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/^http/, 'ws');

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVND(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-900 border border-amber-300',
    processing: 'bg-[#bde1f9] text-[#13426f] border border-[#2e96ff]/40',
    approved: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
    rejected: 'bg-red-50 text-red-800 border border-red-300',
    manual_review: 'bg-orange-50 text-orange-900 border border-orange-300',
    info_requested: 'bg-amber-50 text-amber-900 border border-amber-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${cls[status] ?? cls.pending}`}>
      {status === 'processing' && <Loader2 size={11} className="animate-spin" />}
      {status === 'approved' && <CheckCircle size={11} className="stroke-[2.5]" />}
      {status === 'rejected' && <X size={11} className="stroke-[2.5]" />}
      {status === 'manual_review' && <AlertTriangle size={11} className="stroke-[2.5]" />}
      {status === 'info_requested' && <AlertTriangle size={11} className="stroke-[2.5]" />}
      {status === 'pending' && <Clock size={11} className="stroke-[2.5]" />}
      {label}
    </span>
  );
}

function FraudGauge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 75 ? '#dc2626' : score >= 50 ? '#ea580c' : score >= 30 ? '#ca8a04' : '#16a34a';
  const label = score >= 75 ? 'Rất cao' : score >= 50 ? 'Cao' : score >= 30 ? 'Trung bình' : 'Thấp';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span><span className="font-semibold" style={{ color }}>{score}/100</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────────────

function DetailModal({
  claim, docs, policies, onUpdated, onClose,
}: {
  claim: Claim;
  docs: DocumentRecord[];
  policies: UserPolicy[];
  onUpdated: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('claims');
  const tc = useTranslations('common');
  const tFlags = useTranslations('fraudFlags');
  const locale = useLocale();
  const toast = useToast();
  const [explanation, setExplanation] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [liveStatus, setLiveStatus] = useState(claim.status);

  const getExplanation = async () => {
    setExplaining(true);
    try {
      const res = await api.post<{ explanation: string }>(
        `/claims/${claim.id}/explain`, {}, { params: { locale } },
      );
      setExplanation(res.data.explanation);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? t('whyFailed'));
    } finally {
      setExplaining(false);
    }
  };
  const [liveData, setLiveData] = useState<Partial<Claim>>({});
  const [providedAt, setProvidedAt] = useState<string | null>(
    claim.additional_info_provided_at ?? null
  );
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [provideNote, setProvideNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const downloadInvoice = async () => {
    setDownloadingInvoice(true);
    try {
      const res = await api.get<Blob>(`/claims/${claim.id}/invoice.pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hoa-don-boi-thuong-${claim.id.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? t('downloadInvoiceFailed'));
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const openDoc = (id: string) => {
    window.open(`${API_BASE}/documents/${id}/file`, '_blank', 'noopener,noreferrer');
  };

  const doneDocs = docs.filter((d) => d.processing_status === 'done');

  const toggleDoc = (id: string) =>
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );

  const uploadNewFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', 'other');
      const res = await api.post<{ document_id: string }>('/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedDocIds((prev) => [...prev, res.data.document_id]);
      onUpdated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? t('provideInfoFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const submitProvideInfo = async () => {
    if (selectedDocIds.length === 0) {
      toast.error(t('provideInfoEmpty'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ provided_at: string }>(
        `/claims/${claim.id}/provide-info`,
        { document_ids: selectedDocIds, note: provideNote.trim() || undefined }
      );
      setLiveStatus('manual_review');
      setProvidedAt(res.data.provided_at);
      setSelectedDocIds([]);
      setProvideNote('');
      toast.success(t('provideInfoSuccess'));
      onUpdated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? t('provideInfoFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (claim.status !== 'processing') return;
    const ws = new WebSocket(`${WS_BASE}/claims/ws/${claim.id}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'status') setLiveStatus(msg.status);
        if (msg.event === 'completed') {
          setLiveStatus(msg.status);
          setLiveData({
            ai_decision: msg.decision,
            ai_reasoning: msg.reasoning,
            ai_fraud_score: msg.fraud_score,
            amount_approved: msg.amount_approved,
          });
        }
      } catch { /* ignore */ }
    };
    return () => { ws.close(); wsRef.current = null; };
  }, [claim.id, claim.status]);

  const merged = { ...claim, status: liveStatus, ...liveData };
  const matchedPolicy = policies.find(p => p.id === merged.policy_id);
  const decisionColor: Record<string, string> = {
    approve: 'text-green-700 bg-green-50 border-green-100',
    reject: 'text-red-700 bg-red-50 border-red-100',
    manual_review: 'text-orange-700 bg-orange-50 border-orange-100',
    need_more_info: 'text-yellow-700 bg-yellow-50 border-yellow-100',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4">
      <div className="bg-white rounded-[26px] shadow-2xl border border-[#d0d5dd] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-7 py-4.5 min-h-[64px] border-b border-[#d0d5dd] bg-[#f9f7f0]">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-[#13426f] text-lg">{t('detailTitle')}</h2>
            <StatusBadge
              status={merged.status}
              label={t(`status.${
                merged.status === 'manual_review' ? 'manualReview'
                : merged.status === 'info_requested' ? 'infoRequested'
                : merged.status
              }`)}
            />
          </div>
          <button onClick={onClose} className="p-2 text-[#616c8a] hover:text-[#13426f] hover:bg-white rounded-full transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 pt-6 pb-14 space-y-5">
          {/* Real-time processing indicator */}
          {merged.status === 'processing' && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />
              <p className="text-sm text-blue-700">{t('realtimeProcessing')}</p>
            </div>
          )}

          {/* Info-requested banner — reviewer wants more docs (TASK-029) */}
          {merged.status === 'info_requested' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-amber-600" />
                <p className="font-semibold text-amber-900">{t('infoRequestedTitle')}</p>
              </div>
              <p className="text-sm text-amber-800 mb-2">{t('infoRequestedBody')}</p>
              {merged.additional_info_requested && merged.additional_info_requested.length > 0 && (
                <div className="bg-white border border-amber-200 rounded-lg p-3 mb-2">
                  <p className="text-xs font-medium text-amber-900 mb-1.5">{t('infoRequestedListTitle')}:</p>
                  <ul className="text-sm text-gray-800 space-y-0.5">
                    {merged.additional_info_requested.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {merged.reviewer_note && (
                <div className="text-xs text-gray-700 mt-2 mb-3">
                  <span className="text-gray-500">{t('reviewerNote')}:</span>{' '}
                  <span className="whitespace-pre-wrap">{merged.reviewer_note}</span>
                </div>
              )}

              {/* Provide-info form */}
              <div className="mt-3 pt-3 border-t border-amber-200 space-y-3">
                <p className="text-sm font-semibold text-amber-900">{t('provideInfoTitle')}</p>
                <p className="text-xs text-amber-800">{t('provideInfoDescription')}</p>

                {/* Existing docs picker */}
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">
                    {t('provideInfoSelectExisting')} ({selectedDocIds.length})
                  </p>
                  {doneDocs.length === 0 ? (
                    <p className="text-xs text-gray-500 italic py-2 px-3 bg-white border border-amber-100 rounded">
                      {t('provideInfoNoDocs')}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto bg-white border border-amber-100 rounded-lg p-2">
                      {doneDocs.map((d) => (
                        <label
                          key={d.document_id}
                          className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 hover:bg-amber-50 px-2 py-1.5 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(d.document_id)}
                            onChange={() => toggleDoc(d.document_id)}
                            className="accent-amber-600"
                          />
                          <FileText size={12} className="text-gray-400 shrink-0" />
                          <span className="truncate flex-1">{d.file_name}</span>
                          <span className="text-[10px] text-gray-400 shrink-0 uppercase">{d.doc_type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upload new */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadNewFile(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 bg-white border border-dashed border-amber-300 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-60"
                  >
                    {uploading
                      ? <><Loader2 size={13} className="animate-spin" /> {t('provideInfoUploading')}</>
                      : <><Upload size={13} /> {t('provideInfoUploadNew')}</>}
                  </button>
                </div>

                {/* Optional note */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    {t('provideInfoNote')}
                  </label>
                  <textarea
                    rows={2}
                    value={provideNote}
                    onChange={(e) => setProvideNote(e.target.value)}
                    placeholder={t('provideInfoNotePlaceholder')}
                    className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <Button
                  size="sm"
                  disabled={submitting || selectedDocIds.length === 0}
                  onClick={submitProvideInfo}
                  className="w-full gap-1.5 bg-amber-600 hover:bg-amber-700"
                >
                  {submitting
                    ? <><Loader2 size={13} className="animate-spin" /> {tc('loading')}</>
                    : <><Check size={13} /> {t('provideInfoSubmit')}</>}
                </Button>
              </div>
            </div>
          )}

          {/* Provided confirmation — shows after user submitted, while reviewer re-evaluates */}
          {merged.status === 'manual_review' && providedAt && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-start gap-2">
              <Check size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div className="text-xs text-green-800">
                <p className="font-semibold">{t('provideInfoAwaitingReReview')}</p>
                <p className="text-green-700 mt-0.5">
                  {t('provideInfoProvidedAt')}: {new Date(providedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Partial approval banner */}
          {merged.is_partial_approval && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-yellow-600" />
                <p className="font-semibold text-yellow-900">{t('partialApprovalTitle')}</p>
              </div>
              {merged.amount_approved != null && (
                <p className="text-sm text-yellow-800 mb-1">
                  {t('amountApproved')}:{' '}
                  <span className="font-bold">{fmtVND(merged.amount_approved)}</span>
                  <span className="text-yellow-700 ml-2">/ {fmtVND(merged.amount_claimed)}</span>
                </p>
              )}
              {merged.reduction_reason && (
                <p className="text-xs text-yellow-700 whitespace-pre-wrap">
                  <span className="text-gray-500">{t('reductionReason') ?? 'Reduction reason'}:</span> {merged.reduction_reason}
                </p>
              )}
            </div>
          )}

          {/* Hợp đồng & Đối tượng được bảo hiểm */}
          {matchedPolicy ? (
            <div className="rounded-xl border bg-emerald-50/70 border-emerald-200 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-900 flex items-center gap-1.5 text-xs">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  Hợp đồng & Đối tượng được bảo hiểm:
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                  {matchedPolicy.policy_number}
                </span>
              </div>
              <div className="text-gray-800 space-y-1 pl-5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Gói bảo hiểm:</span>
                  <span className="font-semibold text-gray-900">{matchedPolicy.plan_name} · Hạn mức: {fmtVND(matchedPolicy.coverage_amount)}</span>
                </div>
                {matchedPolicy.insured_person?.name ? (
                  <div className="pt-1.5 border-t border-emerald-200/60 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Người được bảo hiểm:</span>
                      <span className="font-bold text-gray-900">
                        👤 {matchedPolicy.insured_person.name} ({getRelationshipLabel(matchedPolicy.insured_person.relationship)})
                      </span>
                    </div>
                    {(matchedPolicy.insured_person.dob || matchedPolicy.insured_person.id_number) && (
                      <div className="flex justify-between text-[11px] text-gray-500 mt-0.5">
                        <span>CCCD / Ngày sinh:</span>
                        <span className="font-mono">
                          {[matchedPolicy.insured_person.id_number, matchedPolicy.insured_person.dob].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {matchedPolicy.insured_person.relationship !== 'self' && (
                      <p className="text-[11px] text-emerald-800 bg-emerald-100/70 rounded p-1.5 mt-1 font-medium">
                        ℹ️ Hồ sơ bồi thường cho người thân: <strong>{matchedPolicy.insured_person.name}</strong>. Hạn mức chi trả tính trên hợp đồng của người này.
                      </p>
                    )}
                  </div>
                ) : matchedPolicy.subject_details?.license_plate ? (
                  <div className="pt-1.5 border-t border-emerald-200/60 text-xs flex justify-between">
                    <span className="text-gray-500">Phương tiện:</span>
                    <span className="font-bold text-gray-900">
                      🚗 Biển số {matchedPolicy.subject_details.license_plate} {[matchedPolicy.subject_details.brand, matchedPolicy.subject_details.model].filter(Boolean).join(' ')}
                    </span>
                  </div>
                ) : matchedPolicy.subject_details?.address ? (
                  <div className="pt-1.5 border-t border-emerald-200/60 text-xs flex justify-between">
                    <span className="text-gray-500">Địa chỉ tài sản:</span>
                    <span className="font-bold text-gray-900">🏠 {matchedPolicy.subject_details.address}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : merged.policy_id ? (
            <div className="rounded-xl border bg-gray-50 border-gray-200 p-3 text-xs flex items-center justify-between">
              <span className="text-gray-500">Mã hợp đồng liên kết:</span>
              <span className="font-mono font-medium text-gray-800">#{merged.policy_id.slice(-8).toUpperCase()}</span>
            </div>
          ) : null}

          {/* ── THƯ BẢO LÃNH ĐIỆN TỬ e-GOP (Cashless Direct Billing Guarantee) ── */}
          {merged.partner && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-sky-50/60 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    {merged.partner.partner_type === 'hospital' ? <Hospital size={16} /> : <Wrench size={16} />}
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-blue-700 tracking-wider uppercase block">
                      THƯ BẢO LÃNH ĐIỆN TỬ (e-GOP DIRECT BILLING)
                    </span>
                    <h4 className="font-extrabold text-slate-900 text-sm">
                      {merged.partner.name}
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 font-mono">
                  <CheckCircle size={11} /> ĐÃ DUYỆT BẢO LÃNH
                </span>
              </div>

              <div className="bg-white/95 rounded-xl p-3 border border-blue-100 flex flex-col sm:flex-row items-center gap-3">
                {/* QR Code Presentation Box */}
                <div className="bg-slate-900 p-2.5 rounded-xl text-white flex flex-col items-center justify-center shrink-0 text-center w-full sm:w-auto">
                  <QrCode size={46} className="text-white" />
                  <span className="text-[9px] font-mono text-emerald-400 mt-1 uppercase font-bold">
                    Quét tại quầy tiếp đón
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-700 flex-1 w-full">
                  <div className="flex items-start gap-1.5 text-slate-600 text-[11px]">
                    <MapPin size={12} className="text-red-500 shrink-0 mt-0.5" />
                    <span>{merged.partner.address}, {merged.partner.province}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] pt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 font-mono text-blue-700 font-bold">
                      <Phone size={11} /> {merged.partner.hotline || merged.partner.phone}
                    </span>
                    {merged.partner.cashless_supported && (
                      <span className="text-emerald-700 font-medium">
                        ✓ Miễn ứng tiền mặt (Cashless)
                      </span>
                    )}
                  </div>

                  {merged.partner.notes && (
                    <p className="text-[11px] text-slate-600 italic bg-blue-50/50 p-1.5 rounded border border-blue-100/60 mt-1">
                      Chỉ đạo bảo lãnh: &ldquo;{merged.partner.notes}&rdquo;
                    </p>
                  )}
                </div>
              </div>

              {/* Action: Open Navigation via Goong Map or Google Map */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[11px] text-slate-500">
                  Xuất trình mã QR này tại Bệnh viện/Gara đối tác để được bảo lãnh trực tiếp.
                </span>
                {merged.partner.lat && merged.partner.lng ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(
                        `/risk-map?partner_id=${merged.partner!.id}&dest_lat=${merged.partner!.lat}&dest_lng=${merged.partner!.lng}`,
                        '_blank'
                      );
                    }}
                    className="h-7 text-xs font-bold text-blue-700 border-blue-300 hover:bg-blue-50 gap-1 rounded-xl cursor-pointer"
                  >
                    <Navigation size={12} />
                    Chỉ đường Goong Map
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${merged.partner!.name} ${merged.partner!.address}`
                        )}`,
                        '_blank'
                      );
                    }}
                    className="h-7 text-xs font-bold text-blue-700 border-blue-300 hover:bg-blue-50 gap-1 rounded-xl cursor-pointer"
                  >
                    <Navigation size={12} />
                    Chỉ đường
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Claim info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">{t('claimType')}</p>
              <p className="font-medium text-gray-800">{t(`claimTypes.${merged.claim_type}`)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">{t('amountClaimed')}</p>
              <p className="font-medium text-gray-800">{fmtVND(merged.amount_claimed)}</p>
            </div>
            {merged.province && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{t('province')}</p>
                <p className="font-medium text-gray-800">{merged.province}</p>
              </div>
            )}
            {merged.disaster_type && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{t('disasterType')}</p>
                <p className="font-medium text-gray-800">{t(`disasterTypes.${merged.disaster_type}`)}</p>
              </div>
            )}
          </div>

          {/* ── CHI TIẾT SỰ CỐ & KHAI BÁO CỦA KHÁCH HÀNG ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Calendar size={15} className="text-blue-600" />
              Thông tin Sự cố & Khai báo Bồi thường
            </h4>

            {merged.description && (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70">
                <p className="text-[11px] text-slate-500 mb-1 font-semibold">Diễn biến sự kiện bảo hiểm:</p>
                <p className="text-slate-800 text-xs leading-relaxed italic">
                  &ldquo;{merged.description}&rdquo;
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {merged.incident_date && (
                <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 block">Thời gian xảy ra sự cố:</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    📅 {new Date(merged.incident_date).toLocaleDateString('vi-VN')} {merged.incident_time ? ` lúc ${merged.incident_time}` : ''}
                  </span>
                </div>
              )}

              {merged.incident_location?.address && (
                <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 block">Địa điểm xảy ra:</span>
                  <span className="font-semibold text-slate-800 text-xs line-clamp-1" title={merged.incident_location.address}>
                    📍 {merged.incident_location.address}
                  </span>
                </div>
              )}

              {merged.incident_type && (
                <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 block">Phân loại sự cố:</span>
                  <span className="font-semibold text-slate-800 text-xs uppercase">
                    {merged.incident_type}
                  </span>
                </div>
              )}

              {merged.hospital_admission_number && (
                <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 block">Mã nhập viện / Hồ sơ bệnh án:</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    🏥 {merged.hospital_admission_number}
                  </span>
                </div>
              )}

              {merged.police_report_number && (
                <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 block">Biên bản hiện trường CSGT:</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    🚓 {merged.police_report_number}
                  </span>
                </div>
              )}

              {merged.witness_info?.name && (
                <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
                  <span className="text-[11px] text-slate-500 block">Người làm chứng:</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    👤 {merged.witness_info.name} {merged.witness_info.phone ? `(${merged.witness_info.phone})` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Tài khoản nhận tiền thụ hưởng */}
            {merged.bank_account?.account_number && (
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
                    <CreditCard size={12} className="text-emerald-600" />
                    Tài khoản nhận bồi thường (Payout Account):
                  </span>
                  <p className="font-mono font-bold text-slate-900 text-xs">
                    {merged.bank_account.account_number} · {merged.bank_account.bank_name}
                  </p>
                  <p className="text-[11px] text-slate-600 uppercase font-medium">
                    Chủ tài khoản: {merged.bank_account.account_holder}
                  </p>
                </div>
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full font-mono">
                  VERIFIED
                </span>
              </div>
            )}
          </div>

          {/* ── TÀI LIỆU & MINH CHỨNG ĐÃ UPLOAD ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileCheck size={16} className="text-blue-600" />
                Hồ Sơ & Tài Liệu Minh Chứng Đã Nộp
              </h4>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                {(merged.evidence_files?.length || 0) + (merged.documents?.length || 0)} tệp tin
              </span>
            </div>

            {/* Minh chứng hiện trường & hóa đơn (Evidence files) */}
            {merged.evidence_files && merged.evidence_files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <span>📸 Minh chứng hiện trường, hóa đơn & biên bản ({merged.evidence_files.length})</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {merged.evidence_files.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openDoc(d.id)}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-blue-100 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-300 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText size={15} className="text-blue-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-xs truncate group-hover:text-blue-700 group-hover:underline">
                            {d.file_name}
                          </p>
                          <span className="text-[10px] text-blue-700 font-mono uppercase font-bold">
                            {d.doc_type}
                          </span>
                        </div>
                      </div>
                      <ExternalLink size={13} className="text-slate-400 group-hover:text-blue-600 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tài liệu hỗ trợ / CCCD / Hợp đồng (Supporting documents) */}
            {merged.documents && merged.documents.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <span>📄 Hồ sơ cá nhân & Hợp đồng đính kèm ({merged.documents.length})</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {merged.documents.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openDoc(d.id)}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText size={15} className="text-slate-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-xs truncate group-hover:text-slate-900 group-hover:underline">
                            {d.file_name}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono uppercase">
                            {d.doc_type}
                          </span>
                        </div>
                      </div>
                      <ExternalLink size={13} className="text-slate-400 group-hover:text-slate-700 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(!merged.documents || merged.documents.length === 0) && (!merged.evidence_files || merged.evidence_files.length === 0) && (
              <div className="p-4 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500">
                <p className="text-xs">Chưa có tệp tin đính kèm cho hồ sơ này.</p>
              </div>
            )}
          </div>

          {/* AI Analysis */}
          {(merged.ai_decision || merged.ai_fraud_score != null) && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldAlert size={13} /> {t('aiAnalysis')}
              </p>

              {/* Decision badge */}
              {merged.ai_decision && (
                <div className={`rounded-xl border p-3 text-sm font-semibold ${decisionColor[merged.ai_decision] ?? ''}`}>
                  {t('aiDecision')}: {merged.ai_decision.replace('_', ' ').toUpperCase()}
                </div>
              )}

              {/* Amount approved */}
              {merged.amount_approved != null && (
                <div className="flex items-center justify-between bg-green-50 rounded-xl border border-green-100 px-4 py-3">
                  <span className="text-sm text-green-700">{t('amountApproved')}</span>
                  <span className="font-bold text-green-800 text-base">{fmtVND(merged.amount_approved)}</span>
                </div>
              )}

              {/* Fraud score */}
              {merged.ai_fraud_score != null && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-2">{t('fraudRisk')}</p>
                  <FraudGauge score={merged.ai_fraud_score} />
                  {merged.ai_fraud_flags && merged.ai_fraud_flags.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {merged.ai_fraud_flags.map((flag, i) => (
                        <li key={i} className="text-xs text-orange-600 flex items-start gap-1.5">
                          <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                          {fraudFlagLabel(flag, tFlags)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Reasoning */}
              {merged.ai_reasoning && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1.5">{t('reasoning')}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{merged.ai_reasoning}</p>
                </div>
              )}
            </div>
          )}

          {/* Reviewer info */}
          {merged.reviewer_note && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-3">
              <p className="text-xs text-blue-500 mb-1">{t('reviewNote')}</p>
              <p className="text-sm text-blue-800">{merged.reviewer_note}</p>
            </div>
          )}

          {/* B1 — AI explainer: "Vì sao?" */}
          {['approved', 'rejected', 'manual_review', 'info_requested'].includes(liveStatus) && (
            <div className="bg-violet-50 rounded-xl border border-violet-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                  <Sparkles size={13} /> {t('whyTitle')}
                </p>
                {!explanation && (
                  <Button
                    size="sm" variant="outline"
                    onClick={getExplanation} disabled={explaining}
                    className="h-7 text-xs gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-100"
                  >
                    {explaining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {explaining ? t('whyLoading') : t('whyBtn')}
                  </Button>
                )}
              </div>
              {explanation && (
                <p className="text-sm text-gray-700 leading-relaxed mt-2 whitespace-pre-wrap">{explanation}</p>
              )}
            </div>
          )}
        </div>

        <div className="px-7 py-4.5 min-h-[68px] border-t border-[#d0d5dd] bg-[#f9f7f0] flex items-center justify-end gap-3 rounded-b-[26px]">
          {merged.status === 'approved' && (merged.amount_approved ?? 0) > 0 && (
            <Button
              variant="outline"
              onClick={downloadInvoice}
              disabled={downloadingInvoice}
              title={t('downloadInvoiceHint')}
              className="rounded-full h-10 px-5 text-sm font-bold text-[#13426f] border-[#d0d5dd] bg-white hover:bg-[#eef6ff] shadow-xs cursor-pointer"
            >
              {downloadingInvoice
                ? <><Loader2 size={15} className="mr-2 animate-spin text-[#2e96ff]" /> {t('downloadingInvoice')}</>
                : <><Download size={15} className="mr-2 text-[#2e96ff]" /> {t('downloadInvoice')}</>}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-full h-10 px-6 text-sm font-bold text-[#13426f] border-[#d0d5dd] bg-white hover:bg-gray-100 shadow-xs cursor-pointer"
          >
            {tc('close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ClaimsClient() {
  const t = useTranslations('claims');
  const tc = useTranslations('common');
  const toast = useToast();
  const confirm = useConfirm();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [policies, setPolicies] = useState<UserPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cr, dr, pr] = await Promise.allSettled([
        api.get<Claim[]>('/claims'),
        api.get<DocumentRecord[]>('/documents'),
        api.get<UserPolicy[]>('/policies'),
      ]);
      if (cr.status === 'fulfilled') setClaims(cr.value.data);
      if (dr.status === 'fulfilled') setDocs(dr.value.data);
      if (pr.status === 'fulfilled') setPolicies(pr.value.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStatus
    ? claims.filter(c => c.status === filterStatus)
    : claims;

  const deleteClaim = useCallback(async (e: React.MouseEvent, claimId: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t('deleteConfirmTitle'),
      message: t('deleteConfirmMessage'),
      confirmLabel: tc('delete'),
      cancelLabel: tc('cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingId(claimId);
    try {
      await api.delete(`/claims/${claimId}`);
      setClaims(prev => prev.filter(c => c.id !== claimId));
      if (selected?.id === claimId) setSelected(null);
      toast.success(t('deleteSuccess'));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? t('deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }, [selected, confirm, toast, t, tc]);

  const handleSubmitSuccess = async (claimId: string) => {
    setShowSubmit(false);
    await load();
    const newClaim = claims.find(c => c.id === claimId);
    if (newClaim) setSelected(newClaim);
  };

  const statusLabel = (s: string) =>
    t(`status.${
      s === 'manual_review' ? 'manualReview'
      : s === 'info_requested' ? 'infoRequested'
      : s
    }`);

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-xs border border-[#d0d5dd] rounded-full px-4 py-2 bg-white text-[#13426f] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2e96ff] shadow-xs cursor-pointer"
            >
              <option value="">{t('filterAll')}</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowSubmit(true)}>
            <Plus size={15} className="stroke-[2.5]" />
            <span>{t('submit')}</span>
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[22px] shadow-[0_4px_14px_rgba(0,0,0,0.04)] border border-[#d0d5dd] overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#2e96ff]" size={28} /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-[#616c8a]">
              <FileText size={40} className="opacity-25 mb-3 text-[#13426f]" />
              <p className="text-sm font-medium">{t('noClaimsYet')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f7f0] border-b border-[#d0d5dd]">
                  {[t('typeCol'), t('amountCol'), 'Tỉnh', t('statusCol'), t('dateCol'), ''].map((h, i) => (
                    <th key={i} className="text-left text-xs font-bold text-[#616c8a] px-5 py-3.5 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const policy = policies.find(p => p.id === c.policy_id);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-[#d0d5dd]/70 last:border-b-0 hover:bg-[#bde1f9]/15 cursor-pointer transition-colors"
                      onClick={() => setSelected(c)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">
                          {t(`claimTypes.${c.claim_type}`)}
                          {policy?.plan_name && <span className="text-gray-600 font-normal"> · {policy.plan_name}</span>}
                        </p>
                        {policy ? (
                          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 mt-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {getPolicySubjectLabel(policy)}
                          </span>
                        ) : c.policy_id ? (
                          <span className="text-[11px] font-mono text-gray-400 mt-0.5 block">HĐ: #{c.policy_id.slice(-6).toUpperCase()}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{fmtVND(c.amount_claimed)}</td>
                      <td className="px-4 py-3 text-gray-600">{c.province ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} label={statusLabel(c.status)} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(c.created_at).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <ChevronRight size={14} className="text-gray-300 cursor-pointer" onClick={() => setSelected(c)} />
                        <button
                          disabled={c.status === 'processing' || deletingId === c.id}
                          onClick={e => deleteClaim(e, c.id)}
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title={tc('delete')}
                        >
                          {deletingId === c.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showSubmit && (
        <ClaimSubmitWizard
          onClose={() => setShowSubmit(false)}
          onSuccess={handleSubmitSuccess}
          docs={docs}
          policies={policies}
          onDocUploaded={load}
        />
      )}

      {selected && (
        <DetailModal
          claim={selected}
          docs={docs}
          policies={policies}
          onUpdated={load}
          onClose={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}
