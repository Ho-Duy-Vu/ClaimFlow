'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Check, CheckCircle, ChevronLeft, ChevronRight,
  CreditCard, FileText, Info, Loader2, Plus, ShieldCheck, Sparkles, Trash2, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { PolicyTermsModal } from '@/components/policies/PolicyTermsModal';
import { PaymentModal } from '@/components/policies/PaymentModal';
import api from '@/lib/api';
import { PROVINCES } from '@/lib/provinces';
import { getRelationshipLabel } from '@/lib/policy-helpers';
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
  blood_type?: string;
  allergy_notes?: string;
  // property
  address?: string;
  building_type?: string;
  building_value?: string;
  construction_year?: string;
  floor_area_m2?: string;
  land_certificate_ref?: string;
  property_description?: string;
  // vehicle
  license_plate?: string;
  brand?: string;
  model?: string;
  year?: string;
  frame_number?: string;
  vehicle_color?: string;
  vehicle_usage?: string;
  // disaster
  disaster_sub_type?: string;
  affected_address?: string;
  asset_type?: string;
  asset_description?: string;
  estimated_asset_value?: string;
  land_area_m2?: string;
  has_prior_damage?: boolean;
  prior_damage_description?: string;
  asset_photo_notes?: string;
}
interface HealthDeclaration {
  has_chronic_illness: boolean;
  chronic_illness_detail: string;
  has_surgery_history: boolean;
  surgery_detail: string;
  smokes: boolean;
  blood_type?: string;
  allergy_notes?: string;
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

/** Convert various date formats (DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD) into HTML5 input date format (YYYY-MM-DD) */
export function normalizeDateToInput(raw: unknown): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str || str === 'null' || str === 'None' || str === 'undefined') return '';

  // Already standard ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }

  // YYYY/MM/DD or YYYY.MM.DD
  const ymd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Fallback parse via Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    try {
      return parsed.toISOString().split('T')[0];
    } catch {
      // ignore
    }
  }

  return '';
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
    insured.name = String(get('full_name') || get('insured_name') || get('owner_name') || '');
    insured.dob = normalizeDateToInput(get('date_of_birth') || get('dob') || get('birth_date') || get('ngay_sinh') || get('birthday') || get('ngaysinh'));
    insured.id_number = String(get('id_number') || get('passport_number') || get('license_number') || get('cccd') || get('cmnd') || '');
    const provText = String(get('place_of_origin') || get('place_of_residence') || get('address') || '');
    province = detectProvinceFromText(provText);
    subject.address = String(get('place_of_residence') || get('address') || '');
    subject.license_plate = String(get('vehicle_plate') || get('plate_number') || '');
    subject.brand = String(get('vehicle_brand') || get('brand') || '');
    subject.year = String(get('vehicle_year') || get('year') || '');
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
    insured.dob = normalizeDateToInput(pick('date_of_birth', 'dob', 'birth_date', 'ngay_sinh', 'birthday', 'ngaysinh', 'birth_date_str', 'dateOfBirth'));
    insured.id_number = pick('id_number', 'passport_number', 'license_number', 'cccd', 'cmnd');
    const origin = pick('place_of_origin');
    const addr = pick('place_of_residence', 'owner_address', 'address');
    province = detectProvinceFromText(origin) || detectProvinceFromText(addr);
    subject.address = addr;
    subject.license_plate = pick('plate_number', 'vehicle_plate');
    subject.brand = pick('brand', 'vehicle_brand');
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

  // Payment step (simulated — local demo, no real gateway)
  const [showPayment, setShowPayment] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');

  // Quote (premium preview)
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // User profile & vault documents (TASK: Family Account & Multi-individual reuse)
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name?: string; province?: string } | null>(null);
  const [userDocs, setUserDocs] = useState<any[]>([]);

  // Cached profile records to prevent data contamination between self and family members
  const selfProfileRef = useRef<InsuredForm>({
    name: '',
    dob: '',
    id_number: '',
    relationship: 'self',
  });
  const relativeProfileRef = useRef<InsuredForm>({
    name: '',
    dob: '',
    id_number: '',
    relationship: 'spouse',
  });

  // Track which policy types the user already actively owns for THEMSELVES
  const [ownedActiveTypes, setOwnedActiveTypes] = useState<Set<PolicyType>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  // Fetch plans, user's existing policies, profile, and documents on mount
  useEffect(() => {
    api.get<PlansData>('/policies/plans').then(r => setPlans(r.data)).catch(() => {});
    api.get<UserPolicy[]>('/policies').then(r => {
      const owned = new Set<PolicyType>();
      for (const p of r.data) {
        // Only track policies where user bought for THEMSELVES
        const rel = p.insured_person?.relationship || 'self';
        if (p.status === 'active' && rel === 'self') {
          owned.add(p.policy_type as PolicyType);
        }
      }
      setOwnedActiveTypes(owned);
    }).catch(() => {});

    api.get('/auth/me').then(r => {
      const user = r.data;
      setCurrentUser(user);

      if (user?.full_name) {
        selfProfileRef.current.name = user.full_name;
      }

      // Check if loaded document is for user or a relative
      if (initial.insured.name) {
        const normDoc = normVN(initial.insured.name);
        const normUser = user?.full_name ? normVN(user.full_name) : '';
        const isRelative = Boolean(normUser && normDoc && normDoc !== normUser);

        if (isRelative) {
          relativeProfileRef.current = {
            name: initial.insured.name,
            dob: initial.insured.dob,
            id_number: initial.insured.id_number,
            relationship: 'spouse',
          };
          setInsured(relativeProfileRef.current);
          toast.info(`Hồ sơ thuộc về người thân (${initial.insured.name}). Đã chọn chế độ 'Mua cho người thân'.`);
        } else {
          selfProfileRef.current = {
            name: initial.insured.name,
            dob: initial.insured.dob,
            id_number: initial.insured.id_number,
            relationship: 'self',
          };
          setInsured(selfProfileRef.current);
        }
      } else if (user?.full_name) {
        setInsured(p => ({ ...p, name: user.full_name }));
      }

      if (!initial.province && user?.province) {
        setProvince(user.province);
      }
    }).catch(() => {});

    api.get<any[]>('/documents').then(r => {
      const valid = (r.data || []).filter((d: any) => d.processing_status === 'done' && d.structured_data);
      setUserDocs(valid);
    }).catch(() => {});
  }, [initial.insured.name, initial.insured.dob, initial.insured.id_number, initial.province]);

  // Handle switching persona with strict field isolation
  const handleSwitchPersona = (target: 'self' | 'relative') => {
    if (target === 'self') {
      // Save current relative values if user was in relative mode
      if (insured.relationship !== 'self') {
        relativeProfileRef.current = {
          name: insured.name,
          dob: insured.dob,
          id_number: insured.id_number,
          relationship: insured.relationship || 'spouse',
        };
      }
      // Switch cleanly to self: never retain relative's CCCD or DOB
      setInsured({
        name: currentUser?.full_name || selfProfileRef.current.name || '',
        dob: selfProfileRef.current.dob || '',
        id_number: selfProfileRef.current.id_number || '',
        relationship: 'self',
      });
      toast.info('Đã chuyển sang thông tin chính chủ tài khoản.');
    } else {
      // Save current self values if user was in self mode
      if (insured.relationship === 'self') {
        selfProfileRef.current = {
          name: insured.name,
          dob: insured.dob,
          id_number: insured.id_number,
          relationship: 'self',
        };
      }
      // Switch cleanly to relative: prompt clean entry or selection from vault
      const rel = relativeProfileRef.current;
      setInsured({
        name: rel.name || '',
        dob: rel.dob || '',
        id_number: rel.id_number || '',
        relationship: rel.relationship && rel.relationship !== 'self' ? rel.relationship : 'spouse',
      });
      toast.info('Đã chuyển sang chế độ Mua cho người thân.');
    }
  };

  // Only block self from buying a duplicate policy for themselves
  // Vehicle & Property policies are never blocked here (can insure multiple vehicles/properties)
  const isPersonPolicy = !['vehicle', 'property'].includes(selectedType);
  const alreadyOwnsSelectedType = isPersonPolicy && insured.relationship === 'self' && ownedActiveTypes.has(selectedType);

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
  // fieldErrors: maps fieldKey -> error message for inline highlighting
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate1 = (): string | null => {
    if (!plans[selectedType] || !plans[selectedType][selectedPlanIdx]) return tw('errSelectPlan');
    if (alreadyOwnsSelectedType) return tw('errAlreadyOwned');
    return null;
  };
  const validate2 = (): string | null => {
    const errs: Record<string, string> = {};
    if (!insured.name.trim()) errs['insured_name'] = 'Vui lòng nhập họ và tên người được bảo hiểm';
    if (!insured.dob.trim()) errs['insured_dob'] = 'Vui lòng nhập ngày sinh';
    if (!startDate) errs['start_date'] = 'Vui lòng chọn ngày bắt đầu hiệu lực';
    if (startDate && new Date(startDate) < new Date(new Date().toDateString())) errs['start_date'] = 'Ngày bắt đầu không được trong quá khứ';
    if (needsBeneficiary) {
      if (beneficiaries.length === 0) errs['beneficiaries'] = 'Cần thêm ít nhất 1 người thụ hưởng cho gói nhân thọ / thu nhập';
      else if (Math.abs(beneficiariesTotal - 100) > 0.01) errs['beneficiaries'] = `Tổng tỷ lệ thụ hưởng phải bằng 100% (hiện: ${beneficiariesTotal.toFixed(0)}%)`;
      else {
        for (const b of beneficiaries) {
          if (!b.name.trim() || !b.relationship.trim()) { errs['beneficiaries'] = 'Vui lòng điền đầy đủ tên và quan hệ cho tất cả người thụ hưởng'; break; }
        }
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length > 0 ? Object.values(errs).join(' • ') : null;
  };
  const validate3 = (): string | null => {
    const errs: Record<string, string> = {};
    if (selectedType === 'vehicle') {
      if (!subject.license_plate?.trim()) errs['license_plate'] = 'Vui lòng nhập biển số xe (bắt buộc)';
      if (!subject.brand?.trim()) errs['brand'] = 'Vui lòng nhập hãng xe (bắt buộc)';
      if (!subject.year?.trim()) errs['year'] = 'Vui lòng nhập năm sản xuất (bắt buộc)';
    }
    if (selectedType === 'property') {
      if (!subject.address?.trim()) errs['address'] = 'Vui lòng nhập địa chỉ tài sản (bắt buộc)';
      if (!subject.building_type?.trim()) errs['building_type'] = 'Vui lòng chọn loại công trình (bắt buộc)';
      if (!subject.building_value?.trim()) errs['building_value'] = 'Vui lòng nhập giá trị tài sản ước tính (bắt buộc)';
    }
    if (selectedType === 'disaster') {
      if (!subject.affected_address?.trim()) errs['affected_address'] = 'Vui lòng nhập địa chỉ khu vực tài sản (bắt buộc)';
      if (!subject.asset_description?.trim()) errs['asset_description'] = 'Vui lòng mô tả tài sản cần bảo hiểm (bắt buộc)';
      if (!subject.estimated_asset_value?.trim()) errs['estimated_asset_value'] = 'Vui lòng nhập giá trị tài sản ước tính (bắt buộc)';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length > 0 ? Object.values(errs).join(' • ') : null;
  };
  const validate4 = (): string | null => {
    if (!termsAccepted) return tw('errTermsAccept');
    return null;
  };

  const goNext = () => {
    setError('');
    setFieldErrors({});
    const v = step === 1 ? validate1() : step === 2 ? validate2() : validate3();
    if (v) { setError(v); return; }
    setStep(s => (s + 1) as 1 | 2 | 3 | 4);
  };
  const goBack = () => { setError(''); setFieldErrors({}); setStep(s => (s - 1) as 1 | 2 | 3 | 4); };

  // Helper: return className with red border if field has error
  const fieldCls = (key: string, base = 'text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f] focus:border-[#2e96ff] focus:ring-1 focus:ring-[#2e96ff]/30 transition-all') =>
    `${base}${fieldErrors[key] ? ' border-red-400 ring-1 ring-red-300 focus:ring-red-400' : ''}`;
  const fieldErr = (key: string) =>
    fieldErrors[key] ? <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1"><span>⚠</span> {fieldErrors[key]}</p> : null;

  // Premium due now, derived from payment frequency (yearly = full, quarterly = /4, monthly = /12)
  const annualPremium = quote?.annual_premium ?? currentPlanPremium();
  const amountDue = Math.round(
    paymentFreq === 'yearly' ? annualPremium
    : paymentFreq === 'quarterly' ? annualPremium / 4
    : annualPremium / 12
  );

  function currentPlanPremium(): number {
    return plans[selectedType]?.[selectedPlanIdx]?.annual_premium ?? 0;
  }

  // Step 4 "pay" button: validate terms, mint a transfer reference, open payment modal.
  const openPayment = () => {
    setError('');
    const v = validate4();
    if (v) { setError(v); return; }
    const ref = `CF${selectedType.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-6)}`;
    setPaymentRef(ref);
    setShowPayment(true);
  };

  const handleSubmit = async () => {
    setError('');
    const v = validate4();
    if (v) { setError(v); setShowPayment(false); return; }

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
      setShowPayment(false);
      setSuccess(tw('purchaseSuccess'));
      toast.success(tw('purchaseSuccess'));
      setTimeout(() => onSuccess(), 1000);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, tw('purchaseFailed'));
      setError(msg);
      toast.error(msg);
      setShowPayment(false);   // surface the error on the review step
    } finally {
      setSubmitting(false);
    }
  };

  const currentPlans = plans[selectedType] ?? [];
  const currentPlan = currentPlans[selectedPlanIdx];
  const isBundleMode = !!consolidatedProfile && Object.keys(consolidatedProfile).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs px-4">
      <div className="bg-white rounded-[26px] shadow-2xl border border-[#d0d5dd] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header — Deep Harbor Nautical Anchor */}
        <div className="flex items-center justify-between px-7 py-4.5 min-h-[64px] border-b border-white/10 bg-[#13426f] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2e96ff] flex items-center justify-center text-white shadow-xs shrink-0">
              <ShieldCheck size={20} />
            </div>
            <h2 className="font-bold text-lg tracking-tight">{tw('title')}</h2>
            {isBundleMode && (
              <span className="inline-flex items-center gap-1 text-xs text-white/90 bg-white/20 px-2.5 py-0.5 rounded-full font-semibold">
                <Sparkles size={11} /> {tw('autoFilled')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator — Warm Cream Bar with Pills */}
        <div className="px-7 py-3.5 border-b border-[#d0d5dd] bg-[#f9f7f0] flex items-center gap-2 text-xs">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step === s ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' :
                step > s ? 'bg-emerald-600 text-white' : 'bg-[#d0d5dd] text-[#616c8a]'
              }`}>
                {step > s ? <Check size={14} className="stroke-[2.5]" /> : s}
              </div>
              <span className={`text-xs font-bold ${step === s ? 'text-[#13426f]' : step > s ? 'text-emerald-800' : 'text-[#616c8a]'}`}>
                {s === 1 ? tw('step1') : s === 2 ? tw('step2') : s === 3 ? tw('step3') : tw('step4')}
              </span>
              {s < 4 && <ChevronRight size={12} className="text-[#616c8a]/40" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-7 pt-6 pb-14 space-y-5">
          {/* Auto-fill banner for bundle mode */}
          {isBundleMode && missingFields && missingFields.length > 0 && step <= 2 && (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50/80 p-3.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={14} className="text-amber-600" />
                <p className="text-xs font-bold text-amber-800">{tcl('manualEntryNeeded')} ({missingFields.length})</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.map(f => (
                  <span key={f} className="inline-flex items-center text-xs font-medium text-amber-900 bg-white border border-amber-300 px-2.5 py-0.5 rounded-full capitalize shadow-2xs">
                    {f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 1: Type + Plan ───────────────────────────────────────── */}
          {step === 1 && (
            <>
              {/* Target Persona Selector at Step 1 */}
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-[18px] bg-[#f9f7f0] border border-[#d0d5dd]">
                <div>
                  <span className="text-xs font-bold text-[#13426f] block">
                    {insured.relationship === 'self' ? '👤 Mua cho bản thân' : '👨‍👩‍👧 Mua cho người thân'}
                  </span>
                  <span className="text-[11px] text-[#333333]/70">
                    {insured.relationship === 'self'
                      ? `Hợp đồng đứng tên chính chủ: ${currentUser?.full_name || 'Tôi'}`
                      : `Chủ tài khoản mua bảo hiểm cho thành viên gia đình`}
                  </span>
                </div>
                <div className="inline-flex p-1 rounded-full bg-white border border-[#d0d5dd] text-xs">
                  <button
                    type="button"
                    onClick={() => handleSwitchPersona('self')}
                    className={`px-3.5 py-1 rounded-full transition-all font-bold cursor-pointer ${
                      insured.relationship === 'self'
                        ? 'bg-[#2e96ff] text-white shadow-[0_2px_0_0_rgba(154,207,246,0.5)]'
                        : 'text-[#333333]/70 hover:text-[#13426f]'
                    }`}
                  >
                    👤 Cho bản thân
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPersona('relative')}
                    className={`px-3.5 py-1 rounded-full transition-all font-bold cursor-pointer ${
                      insured.relationship !== 'self'
                        ? 'bg-[#2e96ff] text-white shadow-[0_2px_0_0_rgba(154,207,246,0.5)]'
                        : 'text-[#333333]/70 hover:text-[#13426f]'
                    }`}
                  >
                    👨‍👩‍👧 Cho người thân
                  </button>
                </div>
              </div>

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
                <Label className="text-xs font-bold text-[#13426f] mb-2 block">{tw('selectType')}</Label>
                <div className="flex flex-wrap gap-2">
                  {POLICY_TYPES.map(pt => {
                    const owned = isPersonPolicy && insured.relationship === 'self' && ownedActiveTypes.has(pt);
                    const isSelected = selectedType === pt;
                    return (
                      <button
                        key={pt}
                        onClick={() => { setSelectedType(pt); setSelectedPlanIdx(0); }}
                        className={`text-xs px-3.5 py-1.5 rounded-full font-bold transition-all cursor-pointer border ${
                          isSelected ? 'bg-[#2e96ff] text-white border-[#2e96ff] shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                          : owned ? 'border-amber-300 text-amber-800 bg-amber-50/60'
                          : 'border-[#d0d5dd] text-[#333333] bg-white hover:border-[#2e96ff]'
                        }`}
                      >
                        {tcl(`claimTypes.${pt}`)}
                        {recommendedTypes.has(pt) && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />}
                        {owned && <span className="ml-1.5 text-[10px] text-amber-700">({tw('owned')})</span>}
                      </button>
                    );
                  })}
                </div>
                {alreadyOwnsSelectedType && (
                  <div className="mt-3 p-3.5 rounded-[18px] border border-[#d0d5dd] bg-[#f9f7f0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <ShieldCheck size={16} className="text-[#2e96ff] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-[#13426f]">
                          Bạn đã sở hữu gói {tcl(`claimTypes.${selectedType}`)} cho bản thân
                        </p>
                        <p className="text-[11px] text-[#333333]/70 leading-relaxed">
                          1 tài khoản có thể mua thêm gói này cho Vợ/Chồng, Con cái, Bố/Mẹ hoặc tài sản khác trong gia đình.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSwitchPersona('relative')}
                      className="text-xs shrink-0 rounded-full bg-[#2e96ff] hover:bg-[#2582df] text-white h-8 shadow-[0_2px_0_0_rgba(154,207,246,0.5)] font-bold px-4"
                    >
                      👨‍👩‍👧 Mua cho người thân →
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-bold text-[#13426f]">{tw('selectPlan')}</Label>
                  <button type="button" onClick={() => setShowTerms(true)} className="text-xs font-bold text-[#2e96ff] hover:underline flex items-center gap-1">
                    <Info size={12} /> {tcl('viewTermsLink')}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {currentPlans.map((plan, idx) => {
                    const isSelected = selectedPlanIdx === idx;
                    return (
                      <div key={idx} onClick={() => setSelectedPlanIdx(idx)}
                        className={`p-4 rounded-[18px] border-2 cursor-pointer transition-all ${
                          isSelected ? 'border-[#2e96ff] bg-[#f9f7f0] shadow-pop-xs' : 'border-[#d0d5dd] bg-white hover:border-[#2e96ff]/50'
                        }`}>
                        <p className="text-sm font-bold text-[#13426f] leading-tight mb-1">{plan.plan_name}</p>
                        <p className="text-[11px] text-[#333333]/60">{tcl('coverage')}</p>
                        <p className="text-sm font-black text-[#13426f]">{fmtVND(plan.coverage_amount)}</p>
                        <p className="text-xs text-[#2e96ff] font-bold mt-1">{fmtVND(plan.annual_premium)}/năm</p>
                        {isSelected && (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-[#2e96ff] mt-2">
                            <CheckCircle size={13} /> Đã chọn
                          </div>
                        )}
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
              {/* Target Persona Selector (Family Account concept) */}
              <div className="flex items-center justify-between gap-3 mb-3 p-3.5 rounded-[18px] bg-[#f9f7f0] border border-[#d0d5dd]">
                <div>
                  <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide">{tw('insuredTitle')}</p>
                  <p className="text-[11px] text-[#333333]/70">
                    {insured.relationship === 'self'
                      ? `Chính chủ tài khoản: ${currentUser?.full_name || 'Tôi'}`
                      : `Bên mua: ${currentUser?.full_name || 'Tôi'} — Đang đăng ký cho người thân`}
                  </p>
                </div>
                <div className="inline-flex p-1 rounded-full bg-white border border-[#d0d5dd] text-xs">
                  <button
                    type="button"
                    onClick={() => handleSwitchPersona('self')}
                    className={`px-3.5 py-1 rounded-full transition-all font-bold cursor-pointer ${
                      insured.relationship === 'self'
                        ? 'bg-[#2e96ff] text-white shadow-[0_2px_0_0_rgba(154,207,246,0.5)]'
                        : 'text-[#333333]/70 hover:text-[#13426f]'
                    }`}
                  >
                    👤 Mua cho bản thân
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPersona('relative')}
                    className={`px-3.5 py-1 rounded-full transition-all font-bold cursor-pointer ${
                      insured.relationship !== 'self'
                        ? 'bg-[#2e96ff] text-white shadow-[0_2px_0_0_rgba(154,207,246,0.5)]'
                        : 'text-[#333333]/70 hover:text-[#13426f]'
                    }`}
                  >
                    👨‍👩‍👧 Mua cho người thân
                  </button>
                </div>
              </div>

              {/* Quick auto-fill from uploaded vault documents */}
              {userDocs.length > 0 && (
                <div className="mb-4 p-3 rounded-[18px] border border-[#d0d5dd] bg-[#f9f7f0] flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#2e96ff]/10 text-[#2e96ff] flex items-center justify-center shrink-0">
                    <FileText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-[#13426f] font-bold block">Điền nhanh từ hồ sơ đã tải lên:</span>
                    <select
                      onChange={(e) => {
                        const docId = e.target.value;
                        if (!docId) return;
                        const doc = userDocs.find(d => d.id === docId);
                        if (!doc || !doc.structured_data) return;
                        const s = doc.structured_data;
                        const pick = (...keys: string[]) => {
                          for (const k of keys) {
                            const val = typeof s[k] === 'object' && s[k] !== null ? s[k].value : s[k];
                            if (val && val !== 'null' && val !== 'None') return String(val);
                          }
                          return '';
                        };
                        const n = pick('full_name', 'insured_name', 'owner_name');
                        const d = normalizeDateToInput(pick('date_of_birth', 'dob', 'birth_date', 'ngay_sinh', 'birthday', 'ngaysinh', 'birth_date_str', 'dateOfBirth'));
                        const idNum = pick('id_number', 'passport_number', 'license_number', 'cccd', 'cmnd');
                        const provText = pick('place_of_residence', 'place_of_origin', 'address');
                        const detectedP = detectProvinceFromText(provText);

                        const isDocForSelf = Boolean(currentUser?.full_name && n && normVN(n) === normVN(currentUser.full_name));
                        if (isDocForSelf) {
                          selfProfileRef.current = { name: n, dob: d, id_number: idNum, relationship: 'self' };
                          setInsured(selfProfileRef.current);
                          toast.success(`Đã lấy thông tin chính chủ từ "${doc.file_name}"`);
                        } else {
                          const rel = insured.relationship === 'self' ? 'spouse' : insured.relationship;
                          relativeProfileRef.current = { name: n, dob: d, id_number: idNum, relationship: rel };
                          setInsured(relativeProfileRef.current);
                          toast.success(`Đã lấy thông tin người thân (${n}) từ "${doc.file_name}"`);
                        }
                        if (detectedP) setProvince(detectedP);
                      }}
                      className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3 py-1.5 mt-1.5 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]"
                      defaultValue=""
                    >
                      <option value="">— Chọn hồ sơ từ Kho tài liệu —</option>
                      {userDocs.map(d => {
                        const s = d.structured_data || {};
                        const n = (typeof s.full_name === 'object' ? s.full_name?.value : s.full_name) || d.file_name;
                        return (
                          <option key={d.id} value={d.id}>
                            {d.doc_type?.toUpperCase()} — {n} ({d.file_name})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">
                    {tw('fullName')} * {insured.relationship === 'self' && <span className="text-[10px] text-[#2e96ff] font-medium">(Chính chủ)</span>}
                  </Label>
                  <Input
                    value={insured.name}
                    onChange={e => setInsured(p => ({ ...p, name: e.target.value }))}
                    placeholder={insured.relationship === 'self' ? (currentUser?.full_name || 'Họ và tên') : 'Họ và tên người thân'}
                    className={fieldCls('insured_name')}
                  />
                  {fieldErr('insured_name')}
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('dob')} *</Label>
                  <Input type="date" value={insured.dob} onChange={e => setInsured(p => ({ ...p, dob: e.target.value }))} className={fieldCls('insured_dob')} />
                  {fieldErr('insured_dob')}
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('idNumber')}</Label>
                  <Input value={insured.id_number} onChange={e => setInsured(p => ({ ...p, id_number: e.target.value }))} className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('relationship')}</Label>
                  {insured.relationship === 'self' ? (
                    <div className="flex items-center h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] text-xs text-[#13426f] font-bold">
                      👤 {tw('rel.self')} (Chính chủ tài khoản)
                    </div>
                  ) : (
                    <select
                      value={insured.relationship}
                      onChange={e => setInsured(p => ({ ...p, relationship: e.target.value }))}
                      className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]"
                    >
                      {REL_OPTIONS.filter(r => r !== 'self').map(r => (
                        <option key={r} value={r}>{tw(`rel.${r}`)}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('startDate')} *</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldCls('start_date')} />
                  {fieldErr('start_date')}
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('termYears')}</Label>
                  <select value={termYears} onChange={e => setTermYears(Number(e.target.value))}
                    className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t} {tw('years')}</option>)}
                  </select>
                </div>
              </div>

              <div className="rounded-[18px] border border-[#d0d5dd] bg-[#f9f7f0] p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold text-[#13426f]">{tw('province')}</Label>
                </div>
                <select value={province} onChange={e => setProvince(e.target.value)}
                  className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                  <option value="">— {tw('province')} —</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Beneficiaries (only life/income) */}
              {needsBeneficiary && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide">
                      {tw('beneficiariesTitle')} *
                    </p>
                    <Button size="sm" variant="outline" className="text-xs gap-1 rounded-full border-[#d0d5dd] text-[#13426f] hover:bg-white font-bold h-7.5 px-3" onClick={addBeneficiary}>
                      <Plus size={12} /> {tw('addBeneficiary')}
                    </Button>
                  </div>
                  <p className="text-xs text-[#333333]/70 mb-2.5">{tw('beneficiariesHint')}</p>
                  {beneficiaries.length === 0 ? (
                    <p className="text-xs text-[#616c8a] italic py-3 text-center border border-dashed border-[#d0d5dd] rounded-[18px] bg-[#f9f7f0]">{tw('noBeneficiariesYet')}</p>
                  ) : (
                    <div className="space-y-2">
                      {beneficiaries.map((b, i) => (
                        <div key={i} className="rounded-[18px] border border-[#d0d5dd] bg-white p-3.5 grid grid-cols-12 gap-2.5 items-end shadow-2xs">
                          <div className="col-span-4">
                            <Label className="text-xs font-bold text-[#13426f] mb-1 block">{tw('beneficiaryName')}</Label>
                            <Input value={b.name} onChange={e => updateBeneficiary(i, 'name', e.target.value)} className="text-xs h-8 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] px-3 text-[#13426f]" />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs font-bold text-[#13426f] mb-1 block">{tw('relationship')}</Label>
                            <select value={b.relationship} onChange={e => updateBeneficiary(i, 'relationship', e.target.value)}
                              className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-2.5 h-8 bg-[#f9f7f0] text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                              {REL_OPTIONS.filter(r => r !== 'self').map(r => <option key={r} value={r}>{tw(`rel.${r}`)}</option>)}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs font-bold text-[#13426f] mb-1 block">{tw('percentage')} (%)</Label>
                            <Input type="number" min={0} max={100} value={b.percentage}
                              onChange={e => updateBeneficiary(i, 'percentage', Number(e.target.value))}
                              className="text-xs h-8 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] px-3 text-[#13426f]" />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button onClick={() => removeBeneficiary(i)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors" title={tc('delete')}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <p className={`text-xs font-bold text-right ${Math.abs(beneficiariesTotal - 100) > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
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
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide">{tw('subjectTitle')}</p>
                <span className="text-xs text-red-500 font-semibold">(*) Trường bắt buộc</span>
              </div>

              {/* ── HEALTH form ── */}
              {selectedType === 'health' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('heightCm')}</Label>
                      <Input type="number" value={subject.height_cm ?? ''}
                        onChange={e => setSubject(p => ({ ...p, height_cm: e.target.value }))}
                        placeholder="Ví dụ: 170" className={fieldCls('height_cm')} />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('weightKg')}</Label>
                      <Input type="number" value={subject.weight_kg ?? ''}
                        onChange={e => setSubject(p => ({ ...p, weight_kg: e.target.value }))}
                        placeholder="Ví dụ: 65" className={fieldCls('weight_kg')} />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('occupation')}</Label>
                      <Input value={subject.occupation ?? ''}
                        onChange={e => setSubject(p => ({ ...p, occupation: e.target.value }))}
                        placeholder="Nghề nghiệp hiện tại" className={fieldCls('occupation')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Nhóm máu</Label>
                      <select value={subject.blood_type ?? ''}
                        onChange={e => setSubject(p => ({ ...p, blood_type: e.target.value }))}
                        className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                        <option value="">— Chưa rõ —</option>
                        {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Tiền sử dị ứng thuốc</Label>
                      <Input value={subject.allergy_notes ?? ''}
                        onChange={e => setSubject(p => ({ ...p, allergy_notes: e.target.value }))}
                        placeholder="Không có / Ghi rõ nếu có" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[#2e96ff]/20 bg-[#2e96ff]/5 p-3">
                    <p className="text-xs text-[#13426f]">
                      💡 Thông tin thể chất giúp tính phí bảo hiểm chính xác và đẩy nhanh quá trình xét bồi thường sau này.
                    </p>
                  </div>
                </div>
              )}

              {/* ── PROPERTY form ── */}
              {selectedType === 'property' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Địa chỉ tài sản *</Label>
                      <Input value={subject.address ?? ''}
                        onChange={e => setSubject(p => ({ ...p, address: e.target.value }))}
                        placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                        className={fieldCls('address')} />
                      {fieldErr('address')}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Loại công trình *</Label>
                      <select value={subject.building_type ?? ''}
                        onChange={e => setSubject(p => ({ ...p, building_type: e.target.value }))}
                        className={`w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]${fieldErrors['building_type'] ? ' border-red-400' : ''}`}>
                        <option value="">— Chọn loại —</option>
                        <option value="apartment">Căn hộ chung cư</option>
                        <option value="house">Nhà phố / Nhà liền kề</option>
                        <option value="villa">Biệt thự</option>
                        <option value="townhouse">Nhà hàng xóm</option>
                        <option value="commercial">Nhà / Văn phòng thương mại</option>
                        <option value="warehouse">Kho xưởng</option>
                      </select>
                      {fieldErr('building_type')}
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Giá trị tài sản ước tính (VND) *</Label>
                      <Input type="number" value={subject.building_value ?? ''}
                        onChange={e => setSubject(p => ({ ...p, building_value: e.target.value }))}
                        placeholder="Ví dụ: 2000000000"
                        className={fieldCls('building_value')} />
                      {fieldErr('building_value')}
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Năm xây dựng</Label>
                      <Input type="number" value={subject.construction_year ?? ''}
                        onChange={e => setSubject(p => ({ ...p, construction_year: e.target.value }))}
                        placeholder="Ví dụ: 2015" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Diện tích sử dụng (m²)</Label>
                      <Input type="number" value={subject.floor_area_m2 ?? ''}
                        onChange={e => setSubject(p => ({ ...p, floor_area_m2: e.target.value }))}
                        placeholder="Ví dụ: 120" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Số sổ hồng / Giấy phép XD (tham chiếu)</Label>
                      <Input value={subject.land_certificate_ref ?? ''}
                        onChange={e => setSubject(p => ({ ...p, land_certificate_ref: e.target.value }))}
                        placeholder="Số giấy tờ pháp lý" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Mô tả chi tiết tài sản</Label>
                      <Input value={subject.property_description ?? ''}
                        onChange={e => setSubject(p => ({ ...p, property_description: e.target.value }))}
                        placeholder="Tình trạng, vật liệu xây dựng, đặc điểm nổi bật" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs text-amber-800">
                      📋 Thông tin chi tiết về tài sản giúp xác định mức bồi thường chính xác khi xảy ra sự cố. Hãy cung cấp đầy đủ để tránh tranh chấp sau này.
                    </p>
                  </div>
                </div>
              )}

              {/* ── VEHICLE form ── */}
              {selectedType === 'vehicle' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Biển số xe *</Label>
                      <Input value={subject.license_plate ?? ''}
                        onChange={e => setSubject(p => ({ ...p, license_plate: e.target.value.toUpperCase() }))}
                        placeholder="Ví dụ: 51F-123.45"
                        className={fieldCls('license_plate')} />
                      {fieldErr('license_plate')}
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Hãng xe *</Label>
                      <Input value={subject.brand ?? ''}
                        onChange={e => setSubject(p => ({ ...p, brand: e.target.value }))}
                        placeholder="Toyota, Honda, Yamaha..."
                        className={fieldCls('brand')} />
                      {fieldErr('brand')}
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Dòng xe / Model</Label>
                      <Input value={subject.model ?? ''}
                        onChange={e => setSubject(p => ({ ...p, model: e.target.value }))}
                        placeholder="Camry, Vios, Air Blade..." className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Năm sản xuất *</Label>
                      <Input type="number" value={subject.year ?? ''}
                        onChange={e => setSubject(p => ({ ...p, year: e.target.value }))}
                        placeholder="Ví dụ: 2020"
                        className={fieldCls('year')} />
                      {fieldErr('year')}
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Số khung (VIN / Frame)</Label>
                      <Input value={subject.frame_number ?? ''}
                        onChange={e => setSubject(p => ({ ...p, frame_number: e.target.value }))}
                        placeholder="Số khung xe (17 ký tự VIN)" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Màu sắc xe</Label>
                      <Input value={subject.vehicle_color ?? ''}
                        onChange={e => setSubject(p => ({ ...p, vehicle_color: e.target.value }))}
                        placeholder="Trắng, Đen, Bạc..." className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Mục đích sử dụng</Label>
                      <select value={subject.vehicle_usage ?? ''}
                        onChange={e => setSubject(p => ({ ...p, vehicle_usage: e.target.value }))}
                        className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                        <option value="">— Chọn —</option>
                        <option value="personal">Cá nhân / Gia đình</option>
                        <option value="business">Kinh doanh vận tải</option>
                        <option value="taxi">Taxi / Ride-hailing</option>
                        <option value="delivery">Giao hàng</option>
                        <option value="official">Công vụ</option>
                      </select>
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs text-amber-800">
                      🚗 Số khung và biển số xe là căn cứ pháp lý quan trọng khi xử lý bồi thường. Vui lòng kiểm tra chính xác trên Đăng ký xe / Giấy tờ gốc.
                    </p>
                  </div>
                </div>
              )}

              {/* ── DISASTER form ── */}
              {selectedType === 'disaster' && (
                <div className="space-y-3">
                  {/* Sub-type select */}
                  <div className="rounded-[18px] border border-[#2e96ff]/30 bg-[#2e96ff]/5 p-3.5">
                    <Label className="text-xs text-[#13426f] font-bold mb-1.5 block">📋 Gói đã chọn: {currentPlan?.plan_name}</Label>
                    <p className="text-xs text-[#333333]/80">{currentPlan?.description}</p>
                    {(currentPlan as any)?.coverage_items && (
                      <ul className="mt-2 space-y-1">
                        {((currentPlan as any).coverage_items as string[]).map((item: string, i: number) => (
                          <li key={i} className="text-xs text-[#13426f] flex items-center gap-1.5 font-medium">
                            <span className="text-[#2e96ff] font-bold">✓</span> {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Địa chỉ khu vực tài sản bị ảnh hưởng *</Label>
                      <Input value={subject.affected_address ?? ''}
                        onChange={e => setSubject(p => ({ ...p, affected_address: e.target.value }))}
                        placeholder="Số nhà / thôn / xóm, xã/phường, huyện, tỉnh"
                        className={fieldCls('affected_address')} />
                      {fieldErr('affected_address')}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Loại tài sản cần bảo hiểm *</Label>
                      <select value={subject.asset_type ?? ''}
                        onChange={e => setSubject(p => ({ ...p, asset_type: e.target.value }))}
                        className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                        <option value="">— Chọn loại —</option>
                        <option value="house">Nhà ở / Công trình dân dụng</option>
                        <option value="farmland">Đất nông nghiệp / Ruộng vườn</option>
                        <option value="crops">Hoa màu / Cây trồng</option>
                        <option value="livestock">Vật nuôi / Gia súc</option>
                        <option value="aquaculture">Nuôi trồng thủy sản</option>
                        <option value="equipment">Máy móc nông nghiệp</option>
                        <option value="storage">Kho tàng / Nhà xưởng</option>
                        <option value="other">Khác</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Giá trị tài sản ước tính (VND) *</Label>
                      <Input type="number" value={subject.estimated_asset_value ?? ''}
                        onChange={e => setSubject(p => ({ ...p, estimated_asset_value: e.target.value }))}
                        placeholder="Ví dụ: 500000000"
                        className={fieldCls('estimated_asset_value')} />
                      {fieldErr('estimated_asset_value')}
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Diện tích tài sản (m² hoặc ha)</Label>
                      <Input value={subject.land_area_m2 ?? ''}
                        onChange={e => setSubject(p => ({ ...p, land_area_m2: e.target.value }))}
                        placeholder="Ví dụ: 5000 m² hoặc 0.5 ha" className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Mô tả chi tiết tài sản cần bảo hiểm *</Label>
                    <textarea
                      value={subject.asset_description ?? ''}
                      onChange={e => setSubject(p => ({ ...p, asset_description: e.target.value }))}
                      placeholder="Mô tả tình trạng, đặc điểm tài sản: vật liệu xây dựng, vị trí địa lý (gần sông, vùng trũng...), lịch sử sử dụng, tình trạng hiện tại..."
                      rows={3}
                      className={`w-full text-xs border border-[#d0d5dd] rounded-[16px] p-3 text-[#13426f] focus:outline-none focus:border-[#2e96ff] resize-none bg-white${fieldErrors['asset_description'] ? ' border-red-400 ring-1 ring-red-300' : ''}`}
                    />
                    {fieldErr('asset_description')}
                  </div>

                  <div className="rounded-[18px] border border-[#d0d5dd] bg-white p-3.5 space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={subject.has_prior_damage ?? false}
                        onChange={e => setSubject(p => ({ ...p, has_prior_damage: e.target.checked }))}
                        className="accent-[#2e96ff] mt-0.5" />
                      <span className="text-xs text-[#13426f] font-bold">Tài sản đã từng bị thiệt hại do thiên tai trước đây</span>
                    </label>
                    {subject.has_prior_damage && (
                      <div>
                        <Label className="text-xs font-bold text-[#13426f] mb-1 block">Mô tả thiệt hại lịch sử</Label>
                        <textarea
                          value={subject.prior_damage_description ?? ''}
                          onChange={e => setSubject(p => ({ ...p, prior_damage_description: e.target.value }))}
                          placeholder="Thời điểm, nguyên nhân, mức độ thiệt hại, đã được bồi thường chưa..."
                          rows={2}
                          className="w-full text-xs border border-[#d0d5dd] rounded-[16px] p-3 text-[#13426f] focus:outline-none focus:border-[#2e96ff] resize-none bg-[#f9f7f0]"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">Ghi chú / Link ảnh tài sản</Label>
                    <textarea
                      value={subject.asset_photo_notes ?? ''}
                      onChange={e => setSubject(p => ({ ...p, asset_photo_notes: e.target.value }))}
                      placeholder="Đính kèm link ảnh chụp tài sản (Google Drive, Zalo...) hoặc mô tả ảnh sẽ nộp kèm hồ sơ. Ảnh tài sản giúp đẩy nhanh xét bồi thường."
                      rows={2}
                      className="w-full text-xs border border-[#d0d5dd] rounded-[16px] p-3 text-[#13426f] focus:outline-none focus:border-[#2e96ff] resize-none bg-white"
                    />
                  </div>

                  <div className="rounded-[16px] border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs text-amber-800">
                      ⚠️ Theo quy định bảo hiểm thiên tai: Cần cung cấp đầy đủ thông tin và ảnh chụp tài sản <strong>trước khi</strong> xảy ra sự cố. Hồ sơ thiếu sót có thể ảnh hưởng đến quyết định bồi thường.
                    </p>
                  </div>
                </div>
              )}

              {/* INCOME — no subject details needed */}
              {selectedType === 'income' && (
                <div className="rounded-[18px] border border-[#d0d5dd] bg-[#f9f7f0] p-4 text-center">
                  <p className="text-xs text-[#13426f]">
                    💼 Bảo hiểm thu nhập không yêu cầu khai báo tài sản.<br />
                    Thông tin về nghề nghiệp đã được thu thập ở bước trước.
                  </p>
                </div>
              )}

              {/* Health declaration (health + life) */}
              {needsHealthDecl && (
                <div className="space-y-3 pt-3 border-t border-[#d0d5dd] mt-2">
                  <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide">{tw('healthDeclTitle')}</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer rounded-[16px] border border-[#d0d5dd] p-3 hover:bg-[#f9f7f0] transition-colors bg-white">
                      <input type="checkbox" checked={health.has_chronic_illness}
                        onChange={e => setHealth(p => ({ ...p, has_chronic_illness: e.target.checked }))}
                        className="accent-[#2e96ff] mt-0.5" />
                      <div>
                        <span className="text-xs text-[#13426f] font-bold">{tw('hasChronicIllness')}</span>
                        <p className="text-[11px] text-[#616c8a]">Tim mạch, tiểu đường, huyết áp, ung thư, bệnh mãn tính khác</p>
                      </div>
                    </label>
                    {health.has_chronic_illness && (
                      <Input placeholder={tw('chronicIllnessPh')} value={health.chronic_illness_detail}
                        onChange={e => setHealth(p => ({ ...p, chronic_illness_detail: e.target.value }))}
                        className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    )}
                    <label className="flex items-start gap-2.5 cursor-pointer rounded-[16px] border border-[#d0d5dd] p-3 hover:bg-[#f9f7f0] transition-colors bg-white">
                      <input type="checkbox" checked={health.has_surgery_history}
                        onChange={e => setHealth(p => ({ ...p, has_surgery_history: e.target.checked }))}
                        className="accent-[#2e96ff] mt-0.5" />
                      <div>
                        <span className="text-xs text-[#13426f] font-bold">{tw('hasSurgery')}</span>
                        <p className="text-[11px] text-[#616c8a]">Trong vòng 5 năm gần nhất</p>
                      </div>
                    </label>
                    {health.has_surgery_history && (
                      <Input placeholder={tw('surgeryDetailPh')} value={health.surgery_detail}
                        onChange={e => setHealth(p => ({ ...p, surgery_detail: e.target.value }))}
                        className="text-xs h-9 rounded-full border border-[#d0d5dd] bg-white px-3.5 text-[#13426f]" />
                    )}
                    <label className="flex items-start gap-2.5 cursor-pointer rounded-[16px] border border-[#d0d5dd] p-3 hover:bg-[#f9f7f0] transition-colors bg-white">
                      <input type="checkbox" checked={health.smokes}
                        onChange={e => setHealth(p => ({ ...p, smokes: e.target.checked }))}
                        className="accent-[#2e96ff] mt-0.5" />
                      <span className="text-xs text-[#13426f] font-bold">{tw('smokes')}</span>
                    </label>
                  </div>
                  <div className="rounded-[16px] border border-[#2e96ff]/20 bg-[#2e96ff]/5 p-3">
                    <p className="text-xs text-[#13426f]">
                      ℹ️ Khai báo sức khỏe trung thực giúp hợp đồng bảo hiểm có giá trị pháp lý. Khai báo sai có thể dẫn đến từ chối bồi thường.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 4: Confirm + payment ─────────────────────────────────── */}
          {step === 4 && (
            <>
              {/* Quote summary */}
              <div className="rounded-[20px] border border-[#d0d5dd] bg-[#f9f7f0] p-4.5">
                <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide mb-3">{tw('quoteTitle')}</p>
                {quoteLoading ? (
                  <Loader2 size={16} className="animate-spin text-[#2e96ff]" />
                ) : quote ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-[#616c8a]">{tw('plan')}</span><span className="font-bold text-[#13426f]">{quote.plan_name}</span></div>
                    <div className="flex justify-between"><span className="text-[#616c8a]">{tcl('coverage')}</span><span className="font-bold text-[#13426f]">{fmtVND(quote.coverage_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-[#616c8a]">{tw('basePremium')}</span><span className="text-[#13426f] font-medium">{fmtVND(quote.base_premium)}/năm</span></div>
                    {quote.age !== null && (
                      <div className="flex justify-between">
                        <span className="text-[#616c8a]">{tw('ageMultiplier')} ({tw('ageLabel')} {quote.age})</span>
                        <span className={quote.age_multiplier > 1 ? 'text-amber-700 font-bold' : 'text-[#13426f]'}>
                          ×{quote.age_multiplier.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[#d0d5dd] pt-2 mt-2">
                      <span className="text-[#13426f] font-bold">{tw('finalPremium')}</span>
                      <span className="font-black text-[#2e96ff] text-base">{fmtVND(quote.annual_premium)}/năm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#616c8a] text-[11px]">{tw('totalForTerm')} ({termYears} {tw('years')})</span>
                      <span className="text-[#13426f] font-bold text-xs">{fmtVND(quote.total_premium)}</span>
                    </div>
                  </div>
                ) : currentPlan ? (
                  <p className="text-xs text-[#13426f] font-bold">{currentPlan.plan_name}: {fmtVND(currentPlan.annual_premium)}/năm</p>
                ) : null}
              </div>

              {/* Insured Person Summary — tách biệt rõ bồi thường cho ai */}
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle size={14} className="text-emerald-600" /> Đối tượng được bảo hiểm
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex gap-1.5">
                    <span className="text-[#616c8a] shrink-0">Họ tên:</span>
                    <span className="font-bold text-[#13426f]">{insured.name || '—'}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-[#616c8a] shrink-0">Quan hệ:</span>
                    <span className="font-bold text-[#13426f]">
                      {insured.relationship === 'self' ? '👤 Bản thân (Chính chủ)' : `👨‍👩‍👧 ${getRelationshipLabel(insured.relationship)}`}
                    </span>
                  </div>
                  {insured.dob && (
                    <div className="flex gap-1.5">
                      <span className="text-[#616c8a] shrink-0">Ngày sinh:</span>
                      <span className="text-[#13426f]">{insured.dob}</span>
                    </div>
                  )}
                  {insured.id_number && (
                    <div className="flex gap-1.5">
                      <span className="text-[#616c8a] shrink-0">CCCD/CMND:</span>
                      <span className="text-[#13426f]">{insured.id_number}</span>
                    </div>
                  )}
                </div>
                {insured.relationship !== 'self' && (
                  <p className="text-[11px] text-emerald-800 pt-2 border-t border-emerald-200/80 leading-relaxed">
                    ⚠️ Hợp đồng bảo hiểm này được mua bởi <strong>{currentUser?.full_name || 'chủ tài khoản'}</strong> cho người thân <strong>{insured.name}</strong>. Bồi thường sẽ được ghi nhận riêng biệt cho người này.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-[#13426f] uppercase tracking-wide">{tw('paymentTitle')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('paymentFreq')}</Label>
                    <select value={paymentFreq} onChange={e => setPaymentFreq(e.target.value as 'monthly' | 'quarterly' | 'yearly')}
                      className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                      <option value="yearly">{tw('yearly')}</option>
                      <option value="quarterly">{tw('quarterly')}</option>
                      <option value="monthly">{tw('monthly')}</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-[#13426f] mb-1.5 block">{tw('paymentMethod')}</Label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'bank_transfer' | 'cash' | 'card')}
                      className="w-full text-xs font-medium border border-[#d0d5dd] rounded-full px-3.5 py-1.5 h-9 bg-white text-[#13426f] focus:outline-none focus:border-[#2e96ff]">
                      <option value="bank_transfer">{tw('bankTransfer')}</option>
                      <option value="card">{tw('card')}</option>
                      <option value="cash">{tw('cash')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* E-sign / terms */}
              <label className="flex items-start gap-2.5 cursor-pointer rounded-[18px] border border-[#d0d5dd] bg-white p-3.5 shadow-2xs">
                <input type="checkbox" checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)} className="accent-[#2e96ff] mt-0.5" />
                <span className="text-xs text-[#13426f] font-medium leading-relaxed">{tw('termsDeclaration')}</span>
              </label>

              {success && (
                <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold bg-emerald-50 border border-emerald-200 rounded-[14px] p-2.5">
                  <CheckCircle size={15} /> {success}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-[16px] border border-red-200 bg-red-50/80 p-3">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <div className="text-xs text-red-700">
                {error.includes(' • ')
                  ? <ul className="space-y-0.5">{error.split(' • ').map((e, i) => <li key={i} className="flex items-start gap-1"><span className="text-red-400 mt-0.5">•</span>{e}</li>)}</ul>
                  : <p>{error}</p>
                }
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4.5 min-h-[70px] border-t border-[#d0d5dd] flex items-center justify-between bg-[#f9f7f0] shrink-0">
          {step > 1 ? (
            <Button variant="outline" onClick={goBack} className="rounded-full border-[#d0d5dd] text-[#13426f] hover:bg-white font-bold gap-1.5 px-5 h-10 text-sm cursor-pointer shadow-xs">
              <ChevronLeft size={16} /> {tw('back')}
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose} className="rounded-full border-[#d0d5dd] text-[#13426f] hover:bg-white font-bold px-5 h-10 text-sm cursor-pointer shadow-xs">{tc('cancel')}</Button>
          )}
          {step < 4 ? (
            <Button onClick={goNext} className="rounded-full bg-[#2e96ff] text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-0.5 hover:bg-[#2582df] font-bold gap-1.5 px-6 h-10 text-sm cursor-pointer">
              {tw('next')} <ChevronRight size={16} />
            </Button>
          ) : (
            <Button onClick={openPayment} disabled={submitting || !!success} className="rounded-full bg-[#2e96ff] text-white shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-0.5 hover:bg-[#2582df] font-bold gap-2 px-7 h-10 text-sm cursor-pointer">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              <CreditCard size={16} /> {tw('proceedToPayment')}
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

        {showPayment && (
          <PaymentModal
            method={paymentMethod}
            frequency={paymentFreq}
            amountDue={amountDue}
            annualPremium={annualPremium}
            reference={paymentRef}
            payerName={insured.name}
            submitting={submitting}
            onCancel={() => { if (!submitting) setShowPayment(false); }}
            onConfirm={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
