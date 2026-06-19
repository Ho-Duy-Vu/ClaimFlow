export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'reviewer' | 'admin';
  province: string | null;
  region: string | null;
  is_active: boolean;
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
  status: 'active' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
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
