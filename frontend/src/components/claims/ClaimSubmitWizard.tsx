'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Database, FileText, Image as ImageIcon, Loader2, Plus, ShieldCheck,
  Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import api from '@/lib/api';
import { PROVINCES } from '@/lib/provinces';
import { getPolicySubjectLabel, getRelationshipLabel, getShortPolicyOptionLabel } from '@/lib/policy-helpers';
import type { DocumentRecord, UserPolicy, DamageAssessment } from '@/types';

type ClaimType = 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';
const DISASTER_TYPES = ['flood', 'storm', 'landslide', 'drought', 'inundation'] as const;

// Required-docs checklist per claim_type (UI informational hint — backend has its own count check)
const REQUIRED_DOCS_BY_TYPE: Record<ClaimType, string[]> = {
  health:   ['hospitalBill', 'prescription', 'medicalRecord'],
  vehicle:  ['policeReport', 'repairQuote', 'damagePhoto'],
  property: ['damagePhoto', 'repairQuote', 'policeReport'],
  disaster: ['disasterConfirmation', 'damagePhoto'],
  life:     ['deathCertificate', 'medicalRecord'],
  income:   ['terminationLetter'],
};

interface PolicyContext {
  policy_id: string;
  policy_type: string;
  plan_name: string;
  coverage_amount: number;
  coverage_spent: number;
  coverage_remaining: number;
  start_date: string;
  end_date: string | null;
  required_evidence_count: number;
}

interface FormState {
  policy_id: string;
  claim_type: ClaimType | '';
  amount_claimed: string;
  province: string;
  disaster_type: string;
  description: string;
  incident_date: string;
  incident_time: string;
  incident_address: string;
  incident_type: string;
  document_ids: string[];
  evidence_document_ids: string[];
  bank_account_number: string;
  bank_name: string;
  bank_account_holder: string;
  hospital_admission_number: string;
  police_report_number: string;
  witness_name: string;
  witness_phone: string;
  fact_declaration: boolean;
}

const initialForm: FormState = {
  policy_id: '', claim_type: '', amount_claimed: '', province: '',
  disaster_type: '', description: '', incident_date: '', incident_time: '',
  incident_address: '', incident_type: '', document_ids: [], evidence_document_ids: [],
  bank_account_number: '', bank_name: '', bank_account_holder: '',
  hospital_admission_number: '', police_report_number: '',
  witness_name: '', witness_phone: '', fact_declaration: false,
};

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

interface Props {
  policies: UserPolicy[];
  docs: DocumentRecord[];
  onClose: () => void;
  onSuccess: (claimId: string) => void;
  onDocUploaded?: () => void;
}

interface DirectDocItem {
  id: string;
  name: string;
  sizeKb: number;
  fileType: 'pdf' | 'image';
  previewUrl?: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

function fmtSize(kb: number) {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function ClaimSubmitWizard({ policies, docs, onClose, onSuccess, onDocUploaded }: Props) {
  const t = useTranslations('claims');
  const tw = useTranslations('claimWizard');
  const tc = useTranslations('common');
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [policyCtx, setPolicyCtx] = useState<PolicyContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Direct upload and synced docs state
  const [userDocs, setUserDocs] = useState<DocumentRecord[]>(docs);
  const [directDocs, setDirectDocs] = useState<DirectDocItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showRepoDocs, setShowRepoDocs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Damage Assessment state
  const [damageAssessment, setDamageAssessment] = useState<DamageAssessment | null>(null);
  const [analyzingDamage, setAnalyzingDamage] = useState(false);

  const handleAnalyzeDamage = async () => {
    setAnalyzingDamage(true);
    try {
      const docId = directDocs[0]?.id || form.evidence_document_ids[0];
      const formData = new FormData();
      if (docId) formData.append('document_id', docId);
      formData.append('claim_type', form.claim_type);
      if (form.description) formData.append('incident_description', form.description);

      const res = await api.post<DamageAssessment>('/claims/analyze-damage', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDamageAssessment(res.data);
      toast.success('AI đã hoàn tất giám định tổn thất và rủi ro gian lận!');
    } catch {
      toast.error('Không thể hoàn tất giám định AI. Vui lòng thử lại.');
    } finally {
      setAnalyzingDamage(false);
    }
  };

  useEffect(() => {
    setUserDocs(docs);
  }, [docs]);

  const activePolicies = useMemo(() => policies.filter(p => p.status === 'active'), [policies]);
  const selectedPolicy = useMemo(() => activePolicies.find(p => p.id === form.policy_id), [activePolicies, form.policy_id]);
  const doneDocs = useMemo(() => userDocs.filter(d => d.processing_status === 'done'), [userDocs]);
  const directDocIds = useMemo(() => new Set(directDocs.map(d => d.id)), [directDocs]);
  const repoDocs = useMemo(() => doneDocs.filter(d => !directDocIds.has(d.document_id)), [doneDocs, directDocIds]);

  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const maxSizeBytes = 20 * 1024 * 1024;

    setIsUploading(true);

    for (const file of fileArray) {
      if (!validMimes.includes(file.type.toLowerCase())) {
        toast.error(tw('fileTypeErr', { name: file.name }));
        continue;
      }
      if (file.size > maxSizeBytes) {
        toast.error(tw('fileSizeLimitErr', { name: file.name }));
        continue;
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const isImg = file.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;

      setDirectDocs(prev => [
        ...prev,
        {
          id: tempId,
          name: file.name,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          fileType: isImg ? 'image' : 'pdf',
          previewUrl,
          status: 'uploading',
        },
      ]);

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('doc_type', 'other');
        fd.append('auto_process', 'true');

        const res = await api.post<{ document_id: string }>('/documents/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const realId = res.data.document_id;

        setDirectDocs(prev =>
          prev.map(item => (item.id === tempId ? { ...item, id: realId, status: 'done' } : item))
        );

        setForm(p => ({
          ...p,
          evidence_document_ids: p.evidence_document_ids.includes(realId)
            ? p.evidence_document_ids
            : [...p.evidence_document_ids, realId],
        }));

        const newDocRecord: DocumentRecord = {
          document_id: realId,
          file_name: file.name,
          file_type: isImg ? 'png' : 'pdf',
          doc_type: 'other',
          file_size_kb: Math.max(1, Math.round(file.size / 1024)),
          processing_status: 'done',
          ocr_confidence: null,
          needs_manual_review: false,
          is_merged: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setUserDocs(prev => [newDocRecord, ...prev.filter(d => d.document_id !== realId)]);

        onDocUploaded?.();
        toast.success(tw('uploadSuccess', { count: 1 }));
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } } };
        const msg = e.response?.data?.detail ?? tw('uploadFailed');
        setDirectDocs(prev =>
          prev.map(item => (item.id === tempId ? { ...item, status: 'error', error: msg } : item))
        );
        toast.error(msg);
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDirectDoc = (docId: string) => {
    setDirectDocs(prev => {
      const target = prev.find(d => d.id === docId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(d => d.id !== docId);
    });
    setForm(p => ({
      ...p,
      evidence_document_ids: p.evidence_document_ids.filter(id => id !== docId),
    }));
  };

  // When user picks policy, fetch context (coverage_remaining, required_evidence_count)
  // and lock claim_type to match policy.
  useEffect(() => {
    if (!form.policy_id) { setPolicyCtx(null); return; }
    setLoadingCtx(true);
    api.get<PolicyContext>(`/claims/policy-context/${form.policy_id}`)
      .then(r => {
        setPolicyCtx(r.data);
        setForm(prev => ({ ...prev, claim_type: r.data.policy_type as ClaimType }));
      })
      .catch(() => setPolicyCtx(null))
      .finally(() => setLoadingCtx(false));
  }, [form.policy_id]);

  const setF = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(p => ({ ...p, [k]: v }));
  }, []);

  const toggleEvidence = (id: string) => {
    setForm(p => ({
      ...p,
      evidence_document_ids: p.evidence_document_ids.includes(id)
        ? p.evidence_document_ids.filter(d => d !== id)
        : [...p.evidence_document_ids, id],
    }));
  };

  const toggleSupporting = (id: string) => {
    setForm(p => ({
      ...p,
      document_ids: p.document_ids.includes(id)
        ? p.document_ids.filter(d => d !== id)
        : [...p.document_ids, id],
    }));
  };

  // ── Step validation ─────────────────────────────────────────────────────────
  const amountNum = parseFloat(form.amount_claimed.replace(/[^0-9.]/g, '')) || 0;

  const step1Errors = (): string[] => {
    const e: string[] = [];
    if (!form.policy_id) e.push(tw('errPolicy'));
    if (!form.incident_date) e.push(tw('errIncidentDate'));
    if (policyCtx && form.incident_date) {
      const inc = new Date(form.incident_date).getTime();
      const start = new Date(policyCtx.start_date).getTime();
      const end = policyCtx.end_date ? new Date(policyCtx.end_date).getTime() : Infinity;
      const now = Date.now();
      if (inc > now) e.push(tw('errIncidentFuture'));
      if (inc < start) e.push(tw('errIncidentBeforePolicy'));
      if (inc > end) e.push(tw('errIncidentAfterPolicy'));
    }
    if (!form.incident_address.trim()) e.push(tw('errIncidentLocation'));
    if (form.description.trim().length < 10) e.push(tw('errDescriptionShort'));
    if (form.claim_type === 'disaster' && !form.disaster_type) e.push(tw('errDisasterType'));
    return e;
  };

  const step2Errors = (): string[] => {
    const e: string[] = [];
    if (amountNum <= 0) e.push(tw('errAmount'));
    if (policyCtx && amountNum > policyCtx.coverage_remaining) e.push(tw('errAmountOverCoverage'));
    return e;
  };

  const step3Errors = (): string[] => {
    const e: string[] = [];
    if (!form.bank_account_number.trim()) e.push(tw('errBankAccount'));
    if (!form.bank_name.trim()) e.push(tw('errBankName'));
    if (!form.bank_account_holder.trim()) e.push(tw('errBankHolder'));
    if (!form.fact_declaration) e.push(tw('errFactDeclaration'));
    return e;
  };

  const goNext = () => {
    setError('');
    const errs = step === 1 ? step1Errors() : step2Errors();
    if (errs.length > 0) { setError(errs[0]); return; }
    setStep(s => (s + 1) as 1 | 2 | 3);
  };

  const goBack = () => {
    setError('');
    setStep(s => (s - 1) as 1 | 2 | 3);
  };

  const handleSubmit = async () => {
    setError('');
    const errs = step3Errors();
    if (errs.length > 0) { setError(errs[0]); return; }

    setSubmitting(true);
    try {
      const r = await api.post<{ claim_id: string }>('/claims/submit', {
        policy_id: form.policy_id,
        claim_type: form.claim_type,
        amount_claimed: amountNum,
        province: form.province || undefined,
        disaster_type: form.claim_type === 'disaster' ? form.disaster_type : undefined,
        description: form.description.trim(),
        incident_date: new Date(form.incident_date).toISOString(),
        incident_time: form.incident_time || undefined,
        incident_location: { address: form.incident_address.trim() },
        incident_type: form.incident_type.trim() || undefined,
        document_ids: form.document_ids,
        evidence_document_ids: form.evidence_document_ids,
        bank_account: {
          account_number: form.bank_account_number.trim(),
          bank_name: form.bank_name.trim(),
          account_holder: form.bank_account_holder.trim(),
        },
        hospital_admission_number: form.hospital_admission_number.trim() || undefined,
        police_report_number: form.police_report_number.trim() || undefined,
        witness_info: form.witness_name.trim() ? {
          name: form.witness_name.trim(),
          phone: form.witness_phone.trim() || null,
        } : undefined,
        fact_declaration: form.fact_declaration,
        damage_assessment: damageAssessment || undefined,
      });
      toast.success(t('submitSuccess') || tw('stepConfirm'));
      onSuccess(r.data.claim_id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string; error?: string } } };
      const msg = e.response?.data?.detail ?? e.response?.data?.error ?? tw('submitFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── No active policy guard ──────────────────────────────────────────────────
  if (activePolicies.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
          <AlertTriangle size={36} className="text-orange-500 mx-auto mb-3" />
          <h3 className="font-bold text-gray-900 mb-2">{tw('noActivePolicyTitle')}</h3>
          <p className="text-sm text-gray-600 mb-4">{tw('noActivePolicyBody')}</p>
          <Button size="sm" onClick={onClose}>{tc('close')}</Button>
        </div>
      </div>
    );
  }

  const requiredDocsKeys = form.claim_type ? REQUIRED_DOCS_BY_TYPE[form.claim_type] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4">
      <div className="bg-white rounded-[26px] shadow-2xl border border-[#d0d5dd] w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header — Deep Harbor Nautical Anchor */}
        <div className="flex items-center justify-between px-7 py-4.5 min-h-[64px] border-b border-white/15 bg-[#13426f] text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2e96ff] flex items-center justify-center text-white shadow-[0_2px_0_0_rgba(154,207,246,0.5)] shrink-0">
              <ShieldCheck size={20} className="stroke-[2.5]" />
            </div>
            <h2 className="font-bold text-lg tracking-tight">{t('submitTitle')}</h2>
          </div>
          <button onClick={onClose} aria-label={tc('close')} className="p-2 text-[#bde1f9] hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator — Warm Cream Bar with Pills */}
        <div className="px-7 py-3.5 border-b border-[#d0d5dd] bg-[#f9f7f0] flex items-center gap-2 text-xs">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step === s ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' :
                step > s ? 'bg-emerald-600 text-white' : 'bg-[#d0d5dd] text-[#616c8a]'
              }`}>
                {step > s ? <Check size={14} className="stroke-[2.5]" /> : s}
              </div>
              <span className={`text-xs font-bold ${step === s ? 'text-[#13426f]' : step > s ? 'text-emerald-800' : 'text-[#616c8a]'}`}>
                {s === 1 ? tw('stepIncident') : s === 2 ? tw('stepEvidence') : tw('stepConfirm')}
              </span>
              {s < 3 && <ChevronRight size={13} className="text-[#616c8a]/50 mx-1" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-7 pt-6 pb-14 space-y-5">
          {/* ── STEP 1: Incident details ───────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('selectPolicy')} *</Label>
                <select
                  value={form.policy_id}
                  onChange={e => setF('policy_id', e.target.value)}
                  className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 focus:outline-none focus:border-[#2e96ff] truncate max-w-full bg-white text-[#13426f]"
                >
                  <option value="">— {tw('selectPolicy')} —</option>
                  {activePolicies.map(p => (
                    <option key={p.id} value={p.id}>
                      {getShortPolicyOptionLabel(p)}
                    </option>
                  ))}
                </select>

                {/* Thẻ đối tượng được bảo hiểm cụ thể của hợp đồng đã chọn */}
                {selectedPolicy && (
                  <div className="mt-2.5 rounded-[18px] border bg-emerald-50/70 border-emerald-200 p-3.5 text-xs space-y-1.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-600" />
                        Đối tượng được bảo hiểm:
                      </span>
                      <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {selectedPolicy.policy_number}
                      </span>
                    </div>
                    <div className="text-[#13426f] pl-5">
                      {selectedPolicy.insured_person?.name ? (
                        <div className="space-y-0.5">
                          <p className="font-medium">
                            👤 <strong>{selectedPolicy.insured_person.name}</strong> ({getRelationshipLabel(selectedPolicy.insured_person.relationship)})
                            {selectedPolicy.insured_person.dob ? ` · Ngày sinh: ${selectedPolicy.insured_person.dob}` : ''}
                            {selectedPolicy.insured_person.id_number ? ` · CCCD: ${selectedPolicy.insured_person.id_number}` : ''}
                          </p>
                          {selectedPolicy.insured_person.relationship !== 'self' && (
                            <p className="text-[11px] text-emerald-800 font-normal">
                              ℹ️ Hồ sơ yêu cầu bồi thường này được mở cho người thân: <strong>{selectedPolicy.insured_person.name}</strong>. Hạn mức chi trả áp dụng riêng cho hợp đồng này.
                            </p>
                          )}
                        </div>
                      ) : selectedPolicy.subject_details?.license_plate ? (
                        <p className="font-medium">🚗 Xe cơ giới: Biển số <strong>{selectedPolicy.subject_details.license_plate}</strong> {[selectedPolicy.subject_details.brand, selectedPolicy.subject_details.model].filter(Boolean).join(' ')}</p>
                      ) : selectedPolicy.subject_details?.address ? (
                        <p className="font-medium">🏠 Tài sản: <strong>{selectedPolicy.subject_details.address}</strong></p>
                      ) : selectedPolicy.subject_details?.disaster_plan ? (
                        <p className="font-medium">🌪️ Gói thiên tai: <strong>{selectedPolicy.subject_details.disaster_plan}</strong></p>
                      ) : (
                        <p className="font-medium">👤 Bản thân chủ tài khoản (Chính chủ)</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {loadingCtx && (
                <div className="flex items-center gap-2 text-xs text-[#616c8a]">
                  <Loader2 size={13} className="animate-spin text-[#2e96ff]" /> {tw('loadingPolicy')}
                </div>
              )}

              {policyCtx && (
                <div className="rounded-[18px] border border-[#d0d5dd] bg-[#f9f7f0] p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#616c8a]">{tw('coverage')}</span>
                    <span className="font-bold text-[#13426f]">{fmtVND(policyCtx.coverage_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#616c8a]">{tw('coverageSpent')}</span>
                    <span className="text-[#13426f] font-medium">{fmtVND(policyCtx.coverage_spent)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#d0d5dd] pt-1.5 mt-1">
                    <span className="text-[#13426f] font-bold">{tw('coverageRemaining')}</span>
                    <span className="font-black text-[#2e96ff]">{fmtVND(policyCtx.coverage_remaining)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('incidentDate')} *</Label>
                  <Input type="date" value={form.incident_date} onChange={e => setF('incident_date', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('incidentTime')}</Label>
                  <Input type="time" value={form.incident_time} onChange={e => setF('incident_time', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('incidentAddress')} *</Label>
                <Input
                  placeholder={tw('incidentAddressPh')}
                  value={form.incident_address}
                  onChange={e => setF('incident_address', e.target.value)}
                  className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{t('province')}</Label>
                  <select
                    value={form.province} onChange={e => setF('province', e.target.value)}
                    className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]"
                  >
                    <option value="">— {t('province')} —</option>
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('incidentType')}</Label>
                  <Input
                    placeholder={tw('incidentTypePh')}
                    value={form.incident_type}
                    onChange={e => setF('incident_type', e.target.value)}
                    className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]"
                  />
                </div>
              </div>

              {form.claim_type === 'disaster' && (
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{t('disasterType')} *</Label>
                  <select
                    value={form.disaster_type} onChange={e => setF('disaster_type', e.target.value)}
                    className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]"
                  >
                    <option value="">— {t('disasterType')} —</option>
                    {DISASTER_TYPES.map(dt => <option key={dt} value={dt}>{t(`disasterTypes.${dt}`)}</option>)}
                  </select>
                </div>
              )}

              <div>
                <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{t('description')} *</Label>
                <textarea
                  rows={4} placeholder={tw('descriptionPh')}
                  value={form.description}
                  onChange={e => setF('description', e.target.value)}
                  className="w-full text-xs border border-[#d0d5dd] rounded-[16px] p-3 resize-none bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]"
                />
              </div>
            </>
          )}

          {/* ── STEP 2: Evidence ───────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Checklist reminder for required docs */}
              {requiredDocsKeys.length > 0 && (
                <div className="rounded-xl border bg-amber-50/70 border-amber-200/80 p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-600" /> {tw('requiredDocsTitle')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {requiredDocsKeys.map(k => (
                      <div key={k} className="text-xs text-gray-700 flex items-center gap-1.5 bg-white/80 px-2 py-1 rounded-md border border-amber-100">
                        <Check size={11} className="text-amber-600 shrink-0" />
                        <span>{tw(`requiredDocs.${k}`)}</span>
                      </div>
                    ))}
                  </div>
                  {policyCtx && (
                    <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs">
                      <span className="text-amber-800 font-medium">
                        {tw('attachedVsRequired', {
                          attached: form.evidence_document_ids.length,
                          required: policyCtx.required_evidence_count,
                        })}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        form.evidence_document_ids.length >= policyCtx.required_evidence_count
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {form.evidence_document_ids.length >= policyCtx.required_evidence_count ? 'Đạt yêu cầu' : 'Chưa đủ chứng từ'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 1. PRIMARY UPLOAD: Direct upload of documents & photos */}
              <div className="rounded-xl border-2 border-blue-200/80 bg-blue-50/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <UploadCloud size={14} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">{tw('directUploadTitle')}</h4>
                      <p className="text-[11px] text-gray-500">{tw('directUploadHint')}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    Chính
                  </span>
                </div>

                {/* Dropzone area */}
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                  onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesUpload(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    dragOver
                      ? 'border-blue-500 bg-blue-100/50 scale-[0.99]'
                      : 'border-blue-300 hover:border-blue-400 bg-white hover:bg-blue-50/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    onChange={e => e.target.files && handleFilesUpload(e.target.files)}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                      <UploadCloud size={20} />
                    </div>
                    <p className="text-xs font-semibold text-gray-800">
                      {dragOver ? tw('dragOverHint') : tw('selectFilesBtn')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Kéo thả hoặc nhấn để duyệt file từ thiết bị (Hỗ trợ JPG, PNG, PDF)
                    </p>
                  </div>
                </div>

                {/* Loading state indicator */}
                {isUploading && (
                  <div className="flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium animate-pulse border border-blue-200">
                    <Loader2 size={13} className="animate-spin" />
                    <span>{tw('uploading')}</span>
                  </div>
                )}

                {/* List of directly uploaded files */}
                {directDocs.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold text-gray-700 flex items-center justify-between">
                      <span>{tw('directUploadedListTitle', { count: directDocs.length })}</span>
                      <span className="text-[10px] text-blue-600 font-normal">Đã tự động đính kèm vào hồ sơ</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {directDocs.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-gray-200 shadow-xs hover:border-blue-300 transition-colors"
                        >
                          {item.previewUrl ? (
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              className="w-10 h-10 rounded object-cover border shrink-0"
                            />
                          ) : item.fileType === 'pdf' ? (
                            <div className="w-10 h-10 rounded bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                              <FileText size={18} />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                              <ImageIcon size={18} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate" title={item.name}>
                              {item.name}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                              <span>{fmtSize(item.sizeKb)}</span>
                              <span>•</span>
                              <span className="text-blue-600 font-medium">{tw('sourceDirect')}</span>
                            </div>
                          </div>
                          {item.status === 'uploading' ? (
                            <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
                          ) : item.status === 'error' ? (
                            <span className="text-[10px] text-red-600 shrink-0 font-medium">{item.error || 'Lỗi'}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeDirectDoc(item.id)}
                              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                              title={tw('removeDoc')}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Damage Assessment Widget */}
              {(directDocs.length > 0 || form.evidence_document_ids.length > 0) && (
                <div className="rounded-xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-blue-50/60 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                        <Sparkles size={15} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-indigo-950">AI Vision Giám Định Tổn Thất & Gian Lận</h4>
                        <p className="text-[11px] text-indigo-700">Trích xuất mức độ thiệt hại & khuyến nghị chi phí từ ảnh hiện trường</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={handleAnalyzeDamage}
                      disabled={analyzingDamage}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-8 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {analyzingDamage ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Đang giám định...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>{damageAssessment ? 'Giám định lại' : '✨ AI Giám định ngay'}</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {damageAssessment && (
                    <div className="bg-white/95 rounded-xl p-3.5 border border-indigo-100 space-y-3 text-xs shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-gray-900 flex items-center gap-1.5">
                          <span>🔍</span> {damageAssessment.damage_type}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          damageAssessment.severity_level === 'minor'
                            ? 'bg-emerald-100 text-emerald-800'
                            : damageAssessment.severity_level === 'moderate'
                            ? 'bg-amber-100 text-amber-800'
                            : damageAssessment.severity_level === 'severe'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          Mức độ: {damageAssessment.severity_level} ({damageAssessment.severity_percentage}%)
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-gray-500">
                          <span>Tỷ lệ tổn thất hiện trường</span>
                          <span className="font-bold text-gray-800">{damageAssessment.severity_percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              damageAssessment.severity_percentage > 70
                                ? 'bg-red-500'
                                : damageAssessment.severity_percentage > 40
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${damageAssessment.severity_percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Detected damage items */}
                      {damageAssessment.detected_items?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-gray-700">Các hạng mục hư hỏng phát hiện:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {damageAssessment.detected_items.map((item, i) => (
                              <span key={i} className="bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded-md border border-slate-200">
                                • {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cost breakdown & Apply action */}
                      <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] text-emerald-800 font-medium">Chi phí bồi thường khuyến nghị của AI:</div>
                          <div className="text-sm font-black text-emerald-950">
                            {fmtVND(damageAssessment.recommended_amount)}
                            <span className="text-[10px] text-emerald-700 font-normal ml-1.5">
                              (Khung: {fmtVND(damageAssessment.estimated_cost_min)} – {fmtVND(damageAssessment.estimated_cost_max)})
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => {
                            setF('amount_claimed', String(damageAssessment.recommended_amount));
                            toast.success(`Đã cập nhật số tiền yêu cầu bồi thường: ${fmtVND(damageAssessment.recommended_amount)}`);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] h-7 px-2.5 rounded-md shrink-0 cursor-pointer shadow-xs"
                        >
                          ✓ Áp dụng số tiền
                        </Button>
                      </div>

                      {/* Summary & Fraud Signals */}
                      <div className="text-[11px] text-gray-600 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                        &ldquo;{damageAssessment.summary_vi}&rdquo;
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100 text-gray-500">
                        <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                          <Check size={13} /> Chống gian lận: {damageAssessment.fraud_check.is_suspicious ? 'Cần đối soát' : 'Tin cậy (Hợp lệ)'}
                        </span>
                        <span className="text-gray-400">Độ tin cậy: {Math.round((1 - damageAssessment.fraud_check.risk_score) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. SECONDARY / SYNCED REPOSITORY: Select from previously processed OCR docs */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRepoDocs(prev => !prev)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      <Database size={13} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800">{tw('secondarySourceTitle')}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Phụ / Đồng bộ
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-1">{tw('secondarySourceHint')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 ml-2">
                    <span>{repoDocs.length} tệp</span>
                    {showRepoDocs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {showRepoDocs && (
                  <div className="p-3 border-t space-y-2 bg-white">
                    <p className="text-[11px] text-gray-500">
                      Tích chọn các tài liệu có sẵn trong tài khoản để gắn kèm làm chứng minh mà không cần tải lại:
                    </p>
                    {repoDocs.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-3 text-center border border-dashed rounded-lg bg-gray-50">
                        {tw('noRepoDocs')}
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto border rounded-lg p-2 bg-gray-50/40">
                        {repoDocs.map(d => {
                          const isChecked = form.evidence_document_ids.includes(d.document_id);
                          return (
                            <label
                              key={d.document_id}
                              className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-colors border ${
                                isChecked
                                  ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                                  : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleEvidence(d.document_id)}
                                className="accent-indigo-600 w-3.5 h-3.5 rounded"
                              />
                              <FileText size={13} className={isChecked ? 'text-indigo-600' : 'text-gray-400'} />
                              <span className="truncate flex-1 font-medium">{d.file_name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                                {d.doc_type}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">
                                {tw('sourceRepo')}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. SUPPORTING DOCUMENTS (Optional: CCCD, Contract, etc.) */}
              <details className="rounded-xl border bg-gray-50/70 p-3">
                <summary className="text-xs font-semibold text-gray-700 cursor-pointer flex items-center justify-between">
                  <span>{tw('supportingDocs')} ({form.document_ids.length})</span>
                  <span className="text-[10px] text-gray-400 font-normal">Tùy chọn bổ sung</span>
                </summary>
                <p className="text-xs text-gray-500 my-2">{tw('supportingDocsHint')}</p>
                {doneDocs.length === 0 ? null : (
                  <div className="space-y-1 max-h-32 overflow-y-auto border bg-white rounded-lg p-2">
                    {doneDocs.map(d => (
                      <label key={d.document_id} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 hover:bg-gray-50 px-2 py-1 rounded">
                        <input
                          type="checkbox"
                          checked={form.document_ids.includes(d.document_id)}
                          onChange={() => toggleSupporting(d.document_id)}
                          className="accent-blue-600"
                        />
                        <FileText size={11} className="text-gray-400 shrink-0" />
                        <span className="truncate flex-1">{d.file_name}</span>
                        <span className="text-[10px] text-gray-400">{d.doc_type}</span>
                      </label>
                    ))}
                  </div>
                )}
              </details>

              {/* 4. SỐ TIỀN YÊU CẦU BỒI THƯỜNG */}
              <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 p-4 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-[#13426f] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#2e96ff] text-white flex items-center justify-center text-[11px] font-bold">₫</span>
                    {t('amountClaimed')} (VNĐ) *
                  </Label>
                  {damageAssessment && (
                    <button
                      type="button"
                      onClick={() => {
                        setF('amount_claimed', String(damageAssessment.recommended_amount));
                        toast.success(`Đã cập nhật: ${fmtVND(damageAssessment.recommended_amount)}`);
                      }}
                      className="text-[11px] text-[#2e96ff] bg-white hover:bg-[#2e96ff]/10 border border-[#2e96ff]/30 px-3 py-1 rounded-full font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Sparkles size={12} className="text-[#2e96ff]" />
                      Gợi ý AI: {fmtVND(damageAssessment.recommended_amount)}
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Ví dụ: 5000000"
                    value={form.amount_claimed}
                    onChange={e => setF('amount_claimed', e.target.value)}
                    className="text-base font-black text-[#13426f] h-11 rounded-full border border-[#d0d5dd] pl-4 pr-14 focus:border-[#2e96ff] focus:ring-1 focus:ring-[#2e96ff]/30 bg-white"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#616c8a] pointer-events-none">
                    VNĐ
                  </span>
                </div>

                {policyCtx && (
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-[#616c8a]">
                      {tw('coverageRemaining')}: <span className="font-bold text-[#13426f] font-mono">{fmtVND(policyCtx.coverage_remaining)}</span>
                    </span>
                    {amountNum > policyCtx.coverage_remaining ? (
                      <span className="text-red-600 font-bold flex items-center gap-1">
                        <AlertTriangle size={13} />
                        Vượt hạn mức còn lại ({fmtVND(policyCtx.coverage_remaining)})
                      </span>
                    ) : amountNum > 0 ? (
                      <span className="text-emerald-700 font-bold">
                        Hợp lệ trong hạn mức
                      </span>
                    ) : null}
                  </div>
                )}

                <p className="text-[11px] text-[#333333]/70 leading-relaxed">
                  💡 Nhập số tiền thực tế theo hóa đơn / báo giá sửa chữa đã đính kèm, hoặc áp dụng theo đề xuất của AI Giám định tổn thất bên trên.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 3: Confirm ────────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div className="space-y-3">
                <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide">{tw('bankAccountTitle')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('bankName')} *</Label>
                    <Input value={form.bank_name} onChange={e => setF('bank_name', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" placeholder="Vietcombank, BIDV, ..." />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('bankAccountNumber')} *</Label>
                    <Input value={form.bank_account_number} onChange={e => setF('bank_account_number', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('bankAccountHolder')} *</Label>
                    <Input value={form.bank_account_holder} onChange={e => setF('bank_account_holder', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                  </div>
                </div>
              </div>

              {/* Type-specific optional fields */}
              {form.claim_type === 'health' && (
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('hospitalAdmissionNumber')}</Label>
                  <Input value={form.hospital_admission_number} onChange={e => setF('hospital_admission_number', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                </div>
              )}

              {(form.claim_type === 'vehicle' || form.claim_type === 'property') && (
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('policeReportNumber')}</Label>
                  <Input value={form.police_report_number} onChange={e => setF('police_report_number', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                </div>
              )}

              <details className="rounded-[18px] border border-[#d0d5dd] bg-white p-3.5">
                <summary className="text-xs font-bold text-[#13426f] cursor-pointer">{tw('witnessTitle')}</summary>
                <div className="grid grid-cols-2 gap-3 mt-2.5">
                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('witnessName')}</Label>
                    <Input value={form.witness_name} onChange={e => setF('witness_name', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] px-3.5 text-[#13426f]" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('witnessPhone')}</Label>
                    <Input value={form.witness_phone} onChange={e => setF('witness_phone', e.target.value)} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] px-3.5 text-[#13426f]" />
                  </div>
                </div>
              </details>

              {/* Summary */}
              <div className="rounded-[20px] border border-[#d0d5dd] bg-[#f9f7f0] p-4 text-xs space-y-1.5">
                <p className="font-bold text-[#13426f] mb-2">{tw('summary')}</p>
                {selectedPolicy && (
                  <div className="flex justify-between border-b border-[#d0d5dd] pb-1.5 mb-1.5">
                    <span className="text-[#616c8a]">Đối tượng bảo hiểm</span>
                    <span className="font-bold text-emerald-800 text-right max-w-[280px] truncate">
                      {getPolicySubjectLabel(selectedPolicy)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-[#616c8a]">{t('claimType')}</span><span className="font-bold text-[#13426f]">{form.claim_type && t(`claimTypes.${form.claim_type}`)}</span></div>
                <div className="flex justify-between"><span className="text-[#616c8a]">{t('amountClaimed')}</span><span className="font-black text-[#2e96ff] text-sm">{fmtVND(amountNum)}</span></div>
                <div className="flex justify-between"><span className="text-[#616c8a]">{tw('incidentDate')}</span><span className="font-medium text-[#13426f]">{form.incident_date}</span></div>
                <div className="flex justify-between">
                  <span className="text-[#616c8a]">{tw('evidenceCount')}</span>
                  <span className="font-bold text-[#13426f]">{form.evidence_document_ids.length}</span>
                </div>

                {/* Evidence files preview list */}
                {form.evidence_document_ids.length > 0 && (
                  <div className="pt-2 border-t border-[#d0d5dd] mt-2 space-y-1">
                    <p className="text-[11px] font-bold text-[#13426f]">
                      {tw('attachedSummaryTitle', { count: form.evidence_document_ids.length })}:
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {form.evidence_document_ids.map(id => {
                        const direct = directDocs.find(d => d.id === id);
                        const repo = userDocs.find(d => d.document_id === id);
                        const name = direct?.name ?? repo?.file_name ?? id;
                        const isDirect = !!direct;
                        return (
                          <div key={id} className="flex items-center justify-between text-[11px] bg-white rounded-full px-3 py-1 border border-[#d0d5dd]">
                            <span className="truncate max-w-[280px] text-[#13426f] font-medium flex items-center gap-1.5">
                              <FileText size={12} className="text-[#2e96ff] shrink-0" />
                              {name}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              isDirect ? 'bg-[#2e96ff]/10 text-[#2e96ff] border border-[#2e96ff]/30' : 'bg-[#13426f]/10 text-[#13426f] border border-[#13426f]/20'
                            }`}>
                              {isDirect ? tw('sourceDirect') : tw('sourceRepo')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Fact declaration */}
              <label className="flex items-start gap-2.5 cursor-pointer rounded-[18px] border border-[#d0d5dd] bg-white p-3.5 shadow-2xs">
                <input
                  type="checkbox"
                  checked={form.fact_declaration}
                  onChange={e => setF('fact_declaration', e.target.checked)}
                  className="accent-[#2e96ff] mt-0.5"
                />
                <span className="text-xs text-[#13426f] font-medium leading-relaxed">{tw('factDeclaration')}</span>
              </label>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-[16px] border border-red-200 bg-red-50/80 p-3">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer with nav buttons */}
        <div className="px-7 py-4.5 min-h-[70px] border-t border-[#d0d5dd] flex items-center justify-between bg-[#f9f7f0] rounded-b-[26px]">
          {step > 1 ? (
            <Button variant="outline" onClick={goBack} className="rounded-full border-[#d0d5dd] text-[#13426f] hover:bg-white font-bold gap-1.5 px-5 h-10 text-sm cursor-pointer shadow-xs">
              <ChevronLeft size={16} /> {tw('back')}
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose} className="rounded-full border-[#d0d5dd] text-[#13426f] hover:bg-white font-bold px-5 h-10 text-sm cursor-pointer shadow-xs">{tc('cancel')}</Button>
          )}
          {step < 3 ? (
            <Button onClick={goNext} className="rounded-full bg-[#2e96ff] text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-0.5 hover:bg-[#2582df] font-bold gap-1.5 px-6 h-10 text-sm cursor-pointer">
              {tw('next')} <ChevronRight size={16} />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="rounded-full bg-[#2e96ff] text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-0.5 hover:bg-[#2582df] font-bold gap-2 px-7 h-10 text-sm cursor-pointer">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {t('submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
