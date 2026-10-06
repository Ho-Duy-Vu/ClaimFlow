export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'reviewer' | 'admin';
  province: string | null;
  region: string | null;
  is_active: boolean;
  specializations?: string[];
  max_active_claims?: number;
}

export interface DocumentRecord {
  document_id: string;
  file_name: string;
  file_type: string;
  doc_type: string;
  file_size_kb: number;
  processing_status: 'pending' | 'processing' | 'done' | 'failed';
  ocr_confidence: number | null;
  needs_manual_review: boolean;
  is_merged: boolean;
  created_at: string;
  updated_at: string;
}

export interface Claim {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'manual_review' | 'info_requested';
  claim_type: 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';
  policy_id?: string | null;
  amount_claimed: number;
  amount_approved: number | null;
  is_partial_approval?: boolean;
  reduction_reason?: string | null;
  additional_info_requested?: string[];
  additional_info_requested_at?: string | null;
  additional_info_provided_at?: string | null;
  ai_decision: string | null;
  ai_reasoning: string | null;
  ai_fraud_score: number | null;
  ai_fraud_flags: string[];
  province: string | null;
  disaster_type: string | null;
  reviewer_note: string | null;
  created_at: string;
  processed_at: string | null;
  documents: Array<{ id: string; doc_type: string; file_name: string }>;
  evidence_files?: Array<{ id: string; doc_type: string; file_name: string }>;
  damage_assessment?: DamageAssessment | null;
  incident_date?: string | null;
  incident_time?: string | null;
  incident_location?: { address: string; lat?: number; lng?: number } | null;
  incident_type?: string | null;
  description?: string | null;
  bank_account?: { account_number: string; bank_name: string; account_holder: string } | null;
  witness_info?: { name?: string | null; phone?: string | null; relation?: string | null } | null;
  hospital_admission_number?: string | null;
  police_report_number?: string | null;
  fact_declaration?: boolean;
  partner_id?: string | null;
  partner_service_type?: string | null;
  partner_guarantee_status?: string | null;
  partner?: PartnerLinkedInfo | null;
  qr_guarantee_payload?: string | null;
}

export interface UserPolicy {
  id: string;
  policy_number: string;
  policy_type: 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';
  plan_name: string;
  description: string;
  insurer: string;
  coverage_amount: number;
  annual_premium: number;
  status: 'active' | 'expired' | 'cancelled' | 'voided';
  start_date: string;
  end_date: string;
  insured_person?: {
    name: string;
    dob: string;
    id_number?: string;
    relationship?: string;
  } | null;
  subject_details?: Record<string, any> | null;
  voided_reason?: string | null;
  voided_at?: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface PolicyPayment {
  id: string;
  policy_id: string;
  installment_no: number;
  total_installments: number;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at: string | null;
  method: string;
  transaction_ref: string | null;
}

export interface PaymentSummary {
  total_installments: number;
  paid_count: number;
  pending_count: number;
  paid_amount: number;
  remaining_amount: number;
  next_due_date: string | null;
  frequency: 'monthly' | 'quarterly' | 'yearly';
}

export interface ConsolidatedField {
  value: string;
  confidence: number;
  source_doc_index: number;
}

export interface BundleDoc {
  index: number;
  doc_type: string;
  fields: Record<string, unknown>;
}

export interface BundleInconsistency {
  field: string;
  values_by_doc: { doc_index: number; value: string }[];
  severity: 'low' | 'medium' | 'high';
}

export interface BundleResult {
  bundle_id: string;
  cached?: boolean;
  documents: BundleDoc[];
  consolidated_profile: Record<string, ConsolidatedField>;
  inconsistencies: BundleInconsistency[];
  missing_for_insurance: string[];
}

export interface GeoRisk {
  province_name: string;
  province_code: string;
  region: 'north' | 'central' | 'south';
  overall_risk_score: number;
  is_high_risk: boolean;
  risk_factors: string[];
  disaster_risks: Array<{
    type: string;
    risk_score: number;
    frequency: string;
  }>;
  recommendations: Array<{
    insurance_type: string;
    priority_score: number;
    reason: string;
  }>;
}

export interface DamageAssessment {
  damage_type: string;
  severity_level: 'minor' | 'moderate' | 'severe' | 'total_loss';
  severity_percentage: number;
  detected_items: string[];
  estimated_cost_min: number;
  estimated_cost_max: number;
  recommended_amount: number;
  currency: string;
  fraud_check: {
    is_suspicious: boolean;
    risk_score: number;
    flags: string[];
  };
  summary_vi: string;
  is_fallback?: boolean;
}

export interface Partner {
  id: string;
  name: string;
  partner_type: 'garage' | 'hospital' | 'rescue';
  province: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  hotline: string;
  cashless_supported: boolean;
  rating: number;
  services: string[];
  opening_hours: string;
  distance_km?: number;
}

export interface SOSTicket {
  ticket_code: string;
  status: string;
  emergency_type: string;
  created_at: string;
  user_name: string;
  user_phone: string;
  incident_location: {
    lat: number;
    lng: number;
    province: string;
    address: string;
  };
  description: string;
  cashless_guarantee: {
    eligible: boolean;
    qr_code_payload: string;
    max_emergency_limit: number;
    note: string;
  };
  dispatched_partners: Partner[];
}

export interface AdjustmentItem {
  id: string;
  item_name: string;
  category?: string;
  claimed_amount: number;
  approved_amount: number;
  reduction_reason?: string;
}

export interface ClaimantHistory {
  prior_claims_count: number;
  prior_approved_count: number;
  prior_rejected_count: number;
  prior_total_paid: number;
  has_fraud_history: boolean;
  frequency_risk: 'low' | 'moderate' | 'high';
}

export interface SLAInfo {
  sla_hours: number;
  sla_deadline: string | null;
  remaining_seconds: number;
  is_overdue: boolean;
}

export interface PartnerLinkedInfo {
  id: string;
  name: string;
  partner_type: 'garage' | 'hospital' | 'rescue';
  province: string;
  address: string;
  lat?: number;
  lng?: number;
  phone?: string;
  hotline?: string;
  cashless_supported: boolean;
  rating?: number;
  services?: string[];
  guarantee_status?: string;
  service_type?: string;
  notes?: string;
  dispatched_at?: string;
}
