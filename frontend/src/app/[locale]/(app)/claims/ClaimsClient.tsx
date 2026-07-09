'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, Check, CheckCircle, ChevronRight, Clock,
  Download, FileText, Loader2, Plus, ShieldAlert, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
// ShieldAlert kept for DetailModal fraud section
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import { ClaimSubmitWizard } from '@/components/claims/ClaimSubmitWizard';
import type { Claim, DocumentRecord, UserPolicy } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES = ['pending', 'processing', 'approved', 'rejected', 'manual_review', 'info_requested'] as const;

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/^http/, 'ws');

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVND(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-600',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
    manual_review: 'bg-orange-100 text-orange-700',
    info_requested: 'bg-amber-100 text-amber-800',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls[status] ?? cls.pending}`}>
      {status === 'processing' && <Loader2 size={10} className="animate-spin" />}
      {status === 'approved' && <CheckCircle size={10} />}
      {status === 'rejected' && <X size={10} />}
      {status === 'manual_review' && <AlertTriangle size={10} />}
      {status === 'info_requested' && <AlertTriangle size={10} />}
      {status === 'pending' && <Clock size={10} />}
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
  claim, docs, onUpdated, onClose,
}: {
  claim: Claim;
  docs: DocumentRecord[];
  onUpdated: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('claims');
  const tc = useTranslations('common');
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
  const decisionColor: Record<string, string> = {
    approve: 'text-green-700 bg-green-50 border-green-100',
    reject: 'text-red-700 bg-red-50 border-red-100',
    manual_review: 'text-orange-700 bg-orange-50 border-orange-100',
    need_more_info: 'text-yellow-700 bg-yellow-50 border-yellow-100',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-900">{t('detailTitle')}</h2>
            <StatusBadge
              status={merged.status}
              label={t(`status.${
                merged.status === 'manual_review' ? 'manualReview'
                : merged.status === 'info_requested' ? 'infoRequested'
                : merged.status
              }`)}
            />
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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
                          {flag}
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

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          {merged.status === 'approved' && (merged.amount_approved ?? 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={downloadInvoice}
              disabled={downloadingInvoice}
              title={t('downloadInvoiceHint')}
              className="text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              {downloadingInvoice
                ? <><Loader2 size={14} className="mr-2 animate-spin" /> {t('downloadingInvoice')}</>
                : <><Download size={14} className="mr-2" /> {t('downloadInvoice')}</>}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>{tc('close')}</Button>
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
              className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('filterAll')}</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowSubmit(true)}>
            <Plus size={14} /> {t('submit')}
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-gray-400">
              <FileText size={36} className="opacity-20 mb-3" />
              <p className="text-sm">{t('noClaimsYet')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {[t('typeCol'), t('amountCol'), 'Tỉnh', t('statusCol'), t('dateCol'), ''].map((h, i) => (
                    <th key={i} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelected(c)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-700">{t(`claimTypes.${c.claim_type}`)}</td>
                    <td className="px-4 py-3 text-gray-800">{fmtVND(c.amount_claimed)}</td>
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
                ))}
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
        />
      )}

      {selected && (
        <DetailModal
          claim={selected}
          docs={docs}
          onUpdated={load}
          onClose={() => { setSelected(null); load(); }}
        />
      )}
    </>
  );
}
