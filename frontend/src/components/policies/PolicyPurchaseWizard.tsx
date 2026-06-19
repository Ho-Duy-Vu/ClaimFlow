'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Check, CheckCircle, ChevronLeft, ChevronRight,
  Info, Loader2, Plus, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { PolicyTermsModal } from '@/components/policies/PolicyTermsModal';
import api from '@/lib/api';
import { PROVINCES } from '@/lib/provinces';
import type { BundleDoc, ConsolidatedField, UserPolicy } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type PolicyType = 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';

interface PlanOption {
  plan_name: string;
  description?: string;
  coverage_amount: number;
  annual_premium: number;
}
type PlansData = Record<PolicyType, PlanOption[]>;

interface GeoRiskRec { insurance_type: string; priority_score: number; reason: string }
interface GeoRiskResponse {
  province: string | null;
  region?: string;
  risk_score: number | null;
  is_high_risk?: boolean;
  recommendations: GeoRiskRec[];
}

interface InsuredForm {
  name: string;
  dob: string;
  id_number: string;
  relationship: string;
}
interface Beneficiary {
  name: string;
  relationship: string;
  percentage: number;
}
interface SubjectDetails {
  // health
  height_cm?: string;
  weight_kg?: string;
  occupation?: string;
  // property
  address?: string;
  building_type?: string;
  building_value?: string;
  // vehicle
  license_plate?: string;
  brand?: string;
  model?: string;
  year?: string;
}
interface HealthDeclaration {
  has_chronic_illness: boolean;
  chronic_illness_detail: string;
  has_surgery_history: boolean;
  surgery_detail: string;
  smokes: boolean;
}

interface QuoteResponse {
  plan_name: string;
  coverage_amount: number;
  base_premium: number;
  age: number | null;
  age_multiplier: number;
  annual_premium: number;
  term_years: number;
  total_premium: number;
}

interface Props {
  /** Single-doc OCR result (legacy fast-path). */
  ocrData?: Record<string, unknown>;
  /** Bundle holistic consolidated profile (TASK-033). */
  consolidatedProfile?: Record<string, ConsolidatedField>;
  bundleDocuments?: BundleDoc[];
  missingFields?: string[];
  /** Pre-select a policy type (from outside — e.g. recommendation click). */
  initialType?: PolicyType;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const POLICY_TYPES: PolicyType[] = ['health', 'life', 'property', 'vehicle', 'disaster', 'income'];
const TERM_OPTIONS = [1, 3, 5, 10];
const REL_OPTIONS = ['self', 'spouse', 'child', 'parent', 'sibling', 'other'];
const REQUIRES_BENEFICIARY: PolicyType[] = ['life', 'income'];
const REQUIRES_HEALTH_DECL: PolicyType[] = ['health', 'life'];

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

/** Surface backend error in a human-readable way.
 * Handles: FastAPI HTTPException ({detail: string}), Pydantic validation ({detail: [{loc, msg, ...}]}),
 * slowapi rate limit ({error: string}), and naked network errors. */
function extractErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    message?: string;
    response?: { status?: number; data?: { detail?: unknown; error?: string } };
  };
  if (!e.response) return e.message ?? fallback;          // network / CORS
  const data = e.response.data ?? {};
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    // Pydantic validation: pick first error, format as "<last loc segment>: <msg>"
    const first = data.detail[0] as { loc?: (string | number)[]; msg?: string } | undefined;
    if (first?.msg) {
      const field = first.loc?.filter(s => s !== 'body').slice(-1)[0];
      return field ? `${field}: ${first.msg}` : first.msg;
    }
  }
  if (typeof data.error === 'string') return data.error;  // slowapi
  return fallback;
}

function getFieldValue(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'object' && 'value' in (v as object)) return String((v as { value: unknown }).value ?? '');
  return String(v);
}

function normVN(s: string): string {
  return s.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectProvinceFromText(text: string): string {
  if (!text) return '';
  const norm = normVN(text);
  let best = '';
  let bestLen = 0;
  for (const p of PROVINCES) {
    const np = normVN(p);
    if (np.length > bestLen && norm.includes(np)) { best = p; bestLen = np.length; }
  }
  return best;
}

/** Pull initial form values from either bundle consolidated_profile or single-doc OCR data. */
function buildInitial(
  consolidated: Record<string, ConsolidatedField> | undefined,
  ocrData: Record<string, unknown> | undefined,
): { insured: InsuredForm; province: string; subject: SubjectDetails } {
  const insured: InsuredForm = { name: '', dob: '', id_number: '', relationship: 'self' };
  const subject: SubjectDetails = {};
  let province = '';

  if (consolidated && Object.keys(consolidated).length > 0) {
    const get = (key: string) => consolidated[key]?.value ?? '';
    insured.name = String(get('full_name') || '');
    insured.dob = String(get('date_of_birth') || '');
    insured.id_number = String(get('id_number') || get('passport_number') || '');
    const provText = String(get('place_of_origin') || get('place_of_residence') || '');
    province = detectProvinceFromText(provText);
    subject.address = String(get('place_of_residence') || get('address') || '');
    subject.license_plate = String(get('vehicle_plate') || '');
    subject.brand = String(get('vehicle_brand') || '');
    subject.year = String(get('vehicle_year') || '');
    subject.occupation = String(get('occupation') || '');
  } else if (ocrData) {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = getFieldValue(ocrData[k]);
        if (v && v !== 'null' && v !== 'None') return v;
      }
      return '';
    };
    insured.name = pick('full_name', 'insured_name', 'owner_name');
    insured.dob = pick('date_of_birth');
    insured.id_number = pick('id_number', 'passport_number', 'license_number');
    const origin = pick('place_of_origin');
    const addr = pick('place_of_residence', 'owner_address', 'address');
    province = detectProvinceFromText(origin) || detectProvinceFromText(addr);
    subject.address = addr;
    subject.license_plate = pick('plate_number');
    subject.brand = pick('brand');
  }

  return { insured, province, subject };
}

function mapRecToType(insuranceType: string): PolicyType | null {
  const lower = insuranceType.toLowerCase();
  if (/thiên tai|bão|lũ|sạt lở|ngập|hạn hán|nông nghiệp/.test(lower)) return 'disaster';
  if (/sức khỏe|y tế|nhập viện|nha khoa|thuốc/.test(lower)) return 'health';
  if (/nhân thọ|tử vong|hưu trí/.test(lower)) return 'life';
  if (/tài sản|nhà ở|cháy nổ/.test(lower)) return 'property';
  if (/xe|ô tô|xe máy/.test(lower)) return 'vehicle';
  if (/thu nhập|thất nghiệp|an sinh|lao động/.test(lower)) return 'income';
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PolicyPurchaseWizard({
  ocrData, consolidatedProfile, bundleDocuments, missingFields, initialType, onClose, onSuccess,
}: Props) {
  const tc = useTranslations('common');
  const tcl = useTranslations('claims');           // share claim-type labels
  const tw = useTranslations('policyWizard');
  const toast = useToast();

  const initial = useMemo(() => buildInitial(consolidatedProfile, ocrData), [consolidatedProfile, ocrData]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState('');

  // Plan + type
  const [selectedType, setSelectedType] = useState<PolicyType>(initialType ?? 'health');
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [plans, setPlans] = useState<PlansData>({} as PlansData);

  // Geo risk
  const [geoRisk, setGeoRisk] = useState<GeoRiskResponse | null>(null);
  const [recommendedTypes, setRecommendedTypes] = useState<Set<PolicyType>>(new Set());

  // Step 2: insured + beneficiaries + start_date + term_years
  const [insured, setInsured] = useState<InsuredForm>(initial.insured);
  const [province, setProvince] = useState(initial.province);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [termYears, setTermYears] = useState(1);

  // Step 3: subject_details + health_declaration
  const [subject, setSubject] = useState<SubjectDetails>(initial.subject);
  const [health, setHealth] = useState<HealthDeclaration>({
    has_chronic_illness: false, chronic_illness_detail: '',
    has_surgery_history: false, surgery_detail: '',
    smokes: false,
  });

  // Step 4: payment + terms
  const [paymentFreq, setPaymentFreq] = useState<'monthly' | 'quarterly' | 'yearly'>('yearly');
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | 'card'>('bank_transfer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Quote (premium preview)
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Track which policy types the user already actively owns — block re-purchase here
  // instead of letting the backend return 409 at submit time.
  const [ownedActiveTypes, setOwnedActiveTypes] = useState<Set<PolicyType>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  // Fetch plans + user's existing policies on mount
  useEffect(() => {
    api.get<PlansData>('/policies/plans').then(r => setPlans(r.data)).catch(() => {});
    api.get<UserPolicy[]>('/policies').then(r => {
      const owned = new Set<PolicyType>();
      for (const p of r.data) {
        if (p.status === 'active') owned.add(p.policy_type as PolicyType);
      }
      setOwnedActiveTypes(owned);
    }).catch(() => {});
  }, []);

  const alreadyOwnsSelectedType = ownedActiveTypes.has(selectedType);

  // Fetch geo risk once we have a province
  useEffect(() => {
    if (!province) return;
    api.post<GeoRiskResponse>('/geo-risk/recommend', { address: province })
      .then(r => {
        setGeoRisk(r.data);
        const types = new Set<PolicyType>(['health']);
        for (const rec of r.data.recommendations ?? []) {
          const m = mapRecToType(rec.insurance_type);
          if (m) types.add(m);
        }
        setRecommendedTypes(types);
      })
      .catch(() => setGeoRisk(null));
  }, [province]);

  // Recompute quote when key inputs change
  useEffect(() => {
    if (!plans[selectedType] || !insured.dob) { setQuote(null); return; }
    setQuoteLoading(true);
    api.post<QuoteResponse>('/policies/quote', {
      policy_type: selectedType,
      plan_index: selectedPlanIdx,
      insured_person: insured.name ? insured : undefined,
      term_years: termYears,
    })
      .then(r => setQuote(r.data))
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
  }, [selectedType, selectedPlanIdx, insured, termYears, plans]);

  // ── Beneficiary helpers ─────────────────────────────────────────────────────
  const addBeneficiary = () =>
    setBeneficiaries(p => [...p, { name: '', relationship: 'spouse', percentage: 100 - p.reduce((s, b) => s + b.percentage, 0) }]);
  const removeBeneficiary = (i: number) =>
    setBeneficiaries(p => p.filter((_, idx) => idx !== i));
  const updateBeneficiary = (i: number, k: keyof Beneficiary, v: string | number) =>
    setBeneficiaries(p => p.map((b, idx) => idx === i ? { ...b, [k]: v } : b));

  const beneficiariesTotal = beneficiaries.reduce((s, b) => s + (b.percentage || 0), 0);
  const needsBeneficiary = REQUIRES_BENEFICIARY.includes(selectedType);
  const needsHealthDecl = REQUIRES_HEALTH_DECL.includes(selectedType);

  // ── Step validation ─────────────────────────────────────────────────────────
  const validate1 = (): string | null => {
    if (!plans[selectedType] || !plans[selectedType][selectedPlanIdx]) return tw('errSelectPlan');
    if (alreadyOwnsSelectedType) return tw('errAlreadyOwned');
    return null;
  };
  const validate2 = (): string | null => {
    if (!insured.name.trim()) return tw('errInsuredName');
    if (!insured.dob.trim()) return tw('errInsuredDob');
    if (!startDate) return tw('errStartDate');
    if (new Date(startDate) < new Date(new Date().toDateString())) return tw('errStartDatePast');
    if (needsBeneficiary) {
      if (beneficiaries.length === 0) return tw('errBeneficiaryRequired');
      if (Math.abs(beneficiariesTotal - 100) > 0.01) return tw('errBeneficiarySum');
      for (const b of beneficiaries) {
        if (!b.name.trim() || !b.relationship.trim()) return tw('errBeneficiaryIncomplete');
      }
    }
    return null;
  };
  const validate3 = (): string | null => {
    if (selectedType === 'vehicle' && !subject.license_plate?.trim()) return tw('errVehiclePlate');
    if (selectedType === 'property' && !subject.address?.trim()) return tw('errPropertyAddress');
    return null;
  };
  const validate4 = (): string | null => {
    if (!termsAccepted) return tw('errTermsAccept');
    return null;
  };

  const goNext = () => {
    setError('');
    const v = step === 1 ? validate1() : step === 2 ? validate2() : validate3();
    if (v) { setError(v); return; }
    setStep(s => (s + 1) as 1 | 2 | 3 | 4);
  };
  const goBack = () => { setError(''); setStep(s => (s - 1) as 1 | 2 | 3 | 4); };

  const handleSubmit = async () => {
    setError('');
    const v = validate4();
    if (v) { setError(v); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        policy_type: selectedType,
        plan_index: selectedPlanIdx,
        insured_person: { ...insured, relationship: insured.relationship || 'self' },
        beneficiaries: needsBeneficiary ? beneficiaries : [],
        start_date: new Date(startDate).toISOString(),
        term_years: termYears,
        subject_details: subject,
        health_declaration: needsHealthDecl ? health : null,
        payment_frequency: paymentFreq,
        payment_method: paymentMethod,
        terms_accepted: termsAccepted,
      };
      await api.post('/policies/purchase', payload);
      setSuccess(tw('purchaseSuccess'));
      toast.success(tw('purchaseSuccess'));
      setTimeout(() => onSuccess(), 1000);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, tw('purchaseFailed'));
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const currentPlans = plans[selectedType] ?? [];
  const currentPlan = currentPlans[selectedPlanIdx];
  const isBundleMode = !!consolidatedProfile && Object.keys(consolidatedProfile).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
          <div className="flex items-center gap-2 text-white">
            <ShieldCheck size={18} />
            <h2 className="font-bold">{tw('title')}</h2>
            {isBundleMode && (
              <span className="inline-flex items-center gap-1 text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                <Sparkles size={10} /> {tw('autoFilled')}
              </span>
            )}
          </div>
          <button onClick={onClose}><X size={18} className="text-blue-100 hover:text-white" /></button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-2 text-xs">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold ${
                step === s ? 'bg-blue-600 text-white' :
                step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step > s ? <Check size={14} /> : s}
              </div>
              <span className={`text-xs font-medium ${step === s ? 'text-blue-700' : step > s ? 'text-green-700' : 'text-gray-400'}`}>
                {s === 1 ? tw('step1') : s === 2 ? tw('step2') : s === 3 ? tw('step3') : tw('step4')}
              </span>
              {s < 4 && <ChevronRight size={12} className="text-gray-300" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Auto-fill banner for bundle mode */}
          {isBundleMode && missingFields && missingFields.length > 0 && step <= 2 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} className="text-amber-600" />
                <p className="text-xs font-semibold text-amber-700">{tcl('manualEntryNeeded')} ({missingFields.length})</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.map(f => (
                  <span key={f} className="inline-flex items-center text-xs text-amber-800 bg-white border border-amber-300 px-2 py-0.5 rounded-full capitalize">
                    {f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 1: Type + Plan ───────────────────────────────────────── */}
          {step === 1 && (
            <>
              {/* Risk recommendations */}
              {geoRisk && geoRisk.recommendations.length > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">
                    {tcl('riskRecommendations')} {geoRisk.province && `· ${geoRisk.province}`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(recommendedTypes).map(t => (
                      <button
                        key={t}
                        onClick={() => { setSelectedType(t); setSelectedPlanIdx(0); }}
                        className={`text-xs px-2.5 py-1 rounded-full border ${selectedType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:border-blue-400'}`}
                      >
                        {tcl(`claimTypes.${t}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs text-gray-600 mb-2 block">{tw('selectType')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {POLICY_TYPES.map(pt => {
                    const owned = ownedActiveTypes.has(pt);
                    return (
                      <button
                        key={pt}
                        onClick={() => { setSelectedType(pt); setSelectedPlanIdx(0); }}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium border ${
                          selectedType === pt ? 'bg-blue-600 text-white border-blue-600'
                          : owned ? 'border-gray-200 text-gray-400 bg-gray-50'
                          : 'border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        {tcl(`claimTypes.${pt}`)}
                        {recommendedTypes.has(pt) && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />}
                        {owned && <span className="ml-1.5 text-[10px] text-gray-500">({tw('owned')})</span>}
                      </button>
                    );
                  })}
                </div>
                {alreadyOwnsSelectedType && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">{tw('alreadyOwnsTypeHint')}</p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-gray-600">{tw('selectPlan')}</Label>
                  <button type="button" onClick={() => setShowTerms(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Info size={11} /> {tcl('viewTermsLink')}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {currentPlans.map((plan, idx) => {
                    const isSelected = selectedPlanIdx === idx;
                    return (
                      <div key={idx} onClick={() => setSelectedPlanIdx(idx)}
                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-100 hover:border-blue-200'
                        }`}>
                        <p className="text-sm font-semibold text-gray-800 leading-tight mb-1">{plan.plan_name}</p>
                        <p className="text-xs text-gray-500">{tcl('coverage')}</p>
                        <p className="text-sm font-bold text-gray-900">{fmtVND(plan.coverage_amount)}</p>
                        <p className="text-xs text-blue-600 font-medium mt-1">{fmtVND(plan.annual_premium)}/năm</p>
                        {isSelected && <CheckCircle size={14} className="text-blue-500 mt-2" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── STEP 2: Insured + Beneficiaries ───────────────────────────── */}
          {step === 2 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{tw('insuredTitle')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('fullName')} *</Label>
                  <Input value={insured.name} onChange={e => setInsured(p => ({ ...p, name: e.target.value }))} className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('dob')} *</Label>
                  <Input type="date" value={insured.dob} onChange={e => setInsured(p => ({ ...p, dob: e.target.value }))} className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('idNumber')}</Label>
                  <Input value={insured.id_number} onChange={e => setInsured(p => ({ ...p, id_number: e.target.value }))} className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('relationship')}</Label>
                  <select value={insured.relationship} onChange={e => setInsured(p => ({ ...p, relationship: e.target.value }))}
                    className="w-full text-sm border rounded-lg px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {REL_OPTIONS.map(r => <option key={r} value={r}>{tw(`rel.${r}`)}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('startDate')} *</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('termYears')}</Label>
                  <select value={termYears} onChange={e => setTermYears(Number(e.target.value))}
                    className="w-full text-sm border rounded-lg px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t} {tw('years')}</option>)}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-gray-600">{tw('province')}</Label>
                </div>
                <select value={province} onChange={e => setProvince(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 h-9 mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— {tw('province')} —</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Beneficiaries (only life/income) */}
              {needsBeneficiary && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {tw('beneficiariesTitle')} *
                    </p>
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={addBeneficiary}>
                      <Plus size={11} /> {tw('addBeneficiary')}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{tw('beneficiariesHint')}</p>
                  {beneficiaries.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2 text-center border rounded-lg">{tw('noBeneficiariesYet')}</p>
                  ) : (
                    <div className="space-y-2">
                      {beneficiaries.map((b, i) => (
                        <div key={i} className="rounded-lg border p-3 grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-4">
                            <Label className="text-xs text-gray-500 mb-1 block">{tw('beneficiaryName')}</Label>
                            <Input value={b.name} onChange={e => updateBeneficiary(i, 'name', e.target.value)} className="text-sm h-8" />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs text-gray-500 mb-1 block">{tw('relationship')}</Label>
                            <select value={b.relationship} onChange={e => updateBeneficiary(i, 'relationship', e.target.value)}
                              className="w-full text-sm border rounded-lg px-2 h-8 focus:outline-none focus:ring-2 focus:ring-blue-500">
                              {REL_OPTIONS.filter(r => r !== 'self').map(r => <option key={r} value={r}>{tw(`rel.${r}`)}</option>)}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs text-gray-500 mb-1 block">{tw('percentage')} (%)</Label>
                            <Input type="number" min={0} max={100} value={b.percentage}
                              onChange={e => updateBeneficiary(i, 'percentage', Number(e.target.value))}
                              className="text-sm h-8" />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button onClick={() => removeBeneficiary(i)} className="p-1 text-gray-400 hover:text-red-500" title={tc('delete')}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <p className={`text-xs font-medium text-right ${Math.abs(beneficiariesTotal - 100) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                        {tw('beneficiariesTotal')}: {beneficiariesTotal.toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP 3: Subject details + health declaration ──────────────── */}
          {step === 3 && (
            <>
              {/* Type-specific subject details */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{tw('subjectTitle')}</p>

              {selectedType === 'health' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('heightCm')}</Label>
                    <Input type="number" value={subject.height_cm ?? ''} onChange={e => setSubject(p => ({ ...p, height_cm: e.target.value }))} className="text-sm h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('weightKg')}</Label>
                    <Input type="number" value={subject.weight_kg ?? ''} onChange={e => setSubject(p => ({ ...p, weight_kg: e.target.value }))} className="text-sm h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('occupation')}</Label>
                    <Input value={subject.occupation ?? ''} onChange={e => setSubject(p => ({ ...p, occupation: e.target.value }))} className="text-sm h-9" />
                  </div>
                </div>
              )}

              {selectedType === 'property' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('propertyAddress')} *</Label>
                    <Input value={subject.address ?? ''} onChange={e => setSubject(p => ({ ...p, address: e.target.value }))} className="text-sm h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('buildingType')}</Label>
                    <select value={subject.building_type ?? ''} onChange={e => setSubject(p => ({ ...p, building_type: e.target.value }))}
                      className="w-full text-sm border rounded-lg px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— —</option>
                      <option value="apartment">{tw('apartment')}</option>
                      <option value="house">{tw('house')}</option>
                      <option value="villa">{tw('villa')}</option>
                      <option value="commercial">{tw('commercial')}</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('buildingValue')}</Label>
                    <Input type="number" value={subject.building_value ?? ''} onChange={e => setSubject(p => ({ ...p, building_value: e.target.value }))} className="text-sm h-9" />
                  </div>
                </div>
              )}

              {selectedType === 'vehicle' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('licensePlate')} *</Label>
                    <Input value={subject.license_plate ?? ''} onChange={e => setSubject(p => ({ ...p, license_plate: e.target.value }))} className="text-sm h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('vehicleBrand')}</Label>
                    <Input value={subject.brand ?? ''} onChange={e => setSubject(p => ({ ...p, brand: e.target.value }))} className="text-sm h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('vehicleModel')}</Label>
                    <Input value={subject.model ?? ''} onChange={e => setSubject(p => ({ ...p, model: e.target.value }))} className="text-sm h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('vehicleYear')}</Label>
                    <Input type="number" value={subject.year ?? ''} onChange={e => setSubject(p => ({ ...p, year: e.target.value }))} className="text-sm h-9" />
                  </div>
                </div>
              )}

              {(selectedType === 'disaster' || selectedType === 'income') && (
                <p className="text-xs text-gray-500 italic">{tw('noSubjectDetails')}</p>
              )}

              {/* Health declaration (health + life) */}
              {needsHealthDecl && (
                <div className="space-y-3 pt-2 border-t mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{tw('healthDeclTitle')}</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={health.has_chronic_illness}
                      onChange={e => setHealth(p => ({ ...p, has_chronic_illness: e.target.checked }))}
                      className="accent-blue-600 mt-0.5" />
                    <span className="text-xs text-gray-700">{tw('hasChronicIllness')}</span>
                  </label>
                  {health.has_chronic_illness && (
                    <Input placeholder={tw('chronicIllnessPh')} value={health.chronic_illness_detail}
                      onChange={e => setHealth(p => ({ ...p, chronic_illness_detail: e.target.value }))} className="text-sm h-9" />
                  )}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={health.has_surgery_history}
                      onChange={e => setHealth(p => ({ ...p, has_surgery_history: e.target.checked }))}
                      className="accent-blue-600 mt-0.5" />
                    <span className="text-xs text-gray-700">{tw('hasSurgery')}</span>
                  </label>
                  {health.has_surgery_history && (
                    <Input placeholder={tw('surgeryDetailPh')} value={health.surgery_detail}
                      onChange={e => setHealth(p => ({ ...p, surgery_detail: e.target.value }))} className="text-sm h-9" />
                  )}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={health.smokes}
                      onChange={e => setHealth(p => ({ ...p, smokes: e.target.checked }))}
                      className="accent-blue-600 mt-0.5" />
                    <span className="text-xs text-gray-700">{tw('smokes')}</span>
                  </label>
                </div>
              )}
            </>
          )}

          {/* ── STEP 4: Confirm + payment ─────────────────────────────────── */}
          {step === 4 && (
            <>
              {/* Quote summary */}
              <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-white p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{tw('quoteTitle')}</p>
                {quoteLoading ? (
                  <Loader2 size={16} className="animate-spin text-blue-400" />
                ) : quote ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">{tw('plan')}</span><span className="font-semibold text-gray-800">{quote.plan_name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{tcl('coverage')}</span><span className="font-semibold text-gray-800">{fmtVND(quote.coverage_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{tw('basePremium')}</span><span className="text-gray-600">{fmtVND(quote.base_premium)}/năm</span></div>
                    {quote.age !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">{tw('ageMultiplier')} ({tw('ageLabel')} {quote.age})</span>
                        <span className={quote.age_multiplier > 1 ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                          ×{quote.age_multiplier.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-gray-600 font-medium">{tw('finalPremium')}</span>
                      <span className="font-bold text-blue-700 text-base">{fmtVND(quote.annual_premium)}/năm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 text-xs">{tw('totalForTerm')} ({termYears} {tw('years')})</span>
                      <span className="text-gray-700 text-xs">{fmtVND(quote.total_premium)}</span>
                    </div>
                  </div>
                ) : currentPlan ? (
                  <p className="text-sm text-gray-700">{currentPlan.plan_name}: {fmtVND(currentPlan.annual_premium)}/năm</p>
                ) : null}
              </div>

              {/* Payment */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{tw('paymentTitle')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('paymentFreq')}</Label>
                    <select value={paymentFreq} onChange={e => setPaymentFreq(e.target.value as 'monthly' | 'quarterly' | 'yearly')}
                      className="w-full text-sm border rounded-lg px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="yearly">{tw('yearly')}</option>
                      <option value="quarterly">{tw('quarterly')}</option>
                      <option value="monthly">{tw('monthly')}</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">{tw('paymentMethod')}</Label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'bank_transfer' | 'cash' | 'card')}
                      className="w-full text-sm border rounded-lg px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="bank_transfer">{tw('bankTransfer')}</option>
                      <option value="card">{tw('card')}</option>
                      <option value="cash">{tw('cash')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* E-sign / terms */}
              <label className="flex items-start gap-2 cursor-pointer rounded-xl border bg-blue-50 border-blue-100 p-3">
                <input type="checkbox" checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)} className="accent-blue-600 mt-0.5" />
                <span className="text-xs text-gray-700 leading-relaxed">{tw('termsDeclaration')}</span>
              </label>

              {success && (
                <div className="flex items-center gap-2 text-green-700 text-sm">
                  <CheckCircle size={14} /> {success}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
              <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50 rounded-b-2xl">
          {step > 1 ? (
            <Button variant="outline" size="sm" onClick={goBack} className="gap-1">
              <ChevronLeft size={13} /> {tw('back')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>{tc('cancel')}</Button>
          )}
          {step < 4 ? (
            <Button size="sm" onClick={goNext} className="gap-1">
              {tw('next')} <ChevronRight size={13} />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !!success} className="gap-1">
              {submitting && <Loader2 size={13} className="animate-spin" />}
              <ShieldCheck size={13} /> {tw('purchase')}
            </Button>
          )}
        </div>

        {bundleDocuments && bundleDocuments.length > 0 && step === 2 && (
          <div className="px-6 pb-3 text-xs text-gray-400 text-center">
            {tw('autoFilledFrom', { count: bundleDocuments.length })}
          </div>
        )}

        {showTerms && (
          <PolicyTermsModal category={selectedType} onClose={() => setShowTerms(false)} zIndexClass="z-[60]" />
        )}
      </div>
    </div>
  );
}
