'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Check, CheckCheck, Clock, FileCheck, Loader2,
  RefreshCw, Shield, ShieldAlert, ShieldCheck, Sliders, Sparkles,
  UserCheck, Users, X, XCircle, ChevronRight, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';

export interface UnderwritingRuleData {
  id?: string;
  stp_enabled: boolean;
  max_stp_amount: number;
  max_stp_fraud_score: number;
  min_ocr_confidence: number;
  high_value_threshold: number;
  auto_dispatch_enabled: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface PendingAdminClaimItem {
  claim_id: string;
  claim_type: string;
  amount_claimed: number;
  amount_approved: number;
  user_id: string;
  claimant_name: string | null;
  claimant_email: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReviewerWorkloadItem {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  specializations: string[];
  max_active_claims: number;
  active_claims_count: number;
}

const CLAIM_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  vehicle: { label: 'Xe cơ giới', icon: '🚗' },
  health: { label: 'Sức khỏe & Y tế', icon: '🏥' },
  property: { label: 'Tài sản & Cháy nổ', icon: '🏢' },
  disaster: { label: 'Thiên tai bão lũ', icon: '🌊' },
  life: { label: 'Sinh mạng', icon: '🛡️' },
  income: { label: 'Thu nhập', icon: '💼' },
};

export function UnderwritingTab() {
  const toast = useToast();
  const confirm = useConfirm();

  const [rules, setRules] = useState<UnderwritingRuleData>({
    stp_enabled: true,
    max_stp_amount: 5000000,
    max_stp_fraud_score: 20,
    min_ocr_confidence: 85,
    high_value_threshold: 50000000,
    auto_dispatch_enabled: true,
  });

  const [pendingClaims, setPendingClaims] = useState<PendingAdminClaimItem[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerWorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Sign-off modal state
  const [signOffModal, setSignOffModal] = useState<{
    open: boolean;
    claim: PendingAdminClaimItem | null;
    approved: boolean;
    notes: string;
  }>({
    open: false,
    claim: null,
    approved: true,
    notes: '',
  });
  const [submittingSignOff, setSubmittingSignOff] = useState(false);

  // Reviewer profile modal state
  const [reviewerModal, setReviewerModal] = useState<{
    open: boolean;
    user: ReviewerWorkloadItem | null;
    specializations: string[];
    maxQuota: number;
  }>({
    open: false,
    user: null,
    specializations: [],
    maxQuota: 10,
  });
  const [savingReviewer, setSavingReviewer] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, pendingRes, usersRes] = await Promise.all([
        api.get<UnderwritingRuleData>('/admin/underwriting-rules').catch(() => null),
        api.get<{ total: number; items: PendingAdminClaimItem[] }>('/admin/claims/pending-admin-approval').catch(() => ({ data: { total: 0, items: [] } })),
        api.get<{ items: any[] }>('/admin/users?role=reviewer').catch(() => ({ data: { items: [] } })),
      ]);

      if (rulesRes && rulesRes.data) {
        setRules(rulesRes.data);
      }
      if (pendingRes && pendingRes.data) {
        setPendingClaims(pendingRes.data.items || []);
      }
      if (usersRes && usersRes.data) {
        // Fetch all reviewers with live workload
        const mapped: ReviewerWorkloadItem[] = (usersRes.data.items || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          specializations: u.specializations || [],
          max_active_claims: u.max_active_claims || 10,
          active_claims_count: u.active_claims_count || 0,
        }));
        setReviewers(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const res = await api.put<UnderwritingRuleData>('/admin/underwriting-rules', rules);
      setRules(res.data);
      toast.success('Đã cập nhật quy tắc thẩm định tự động và ngưỡng Four-Eyes thành công!');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Lưu quy tắc thất bại');
    } finally {
      setSavingRules(false);
    }
  };

  const handleAutoDispatchAll = async () => {
    setDispatching(true);
    try {
      const res = await api.post<{
        total_unassigned: number;
        successfully_dispatched: number;
        auto_dispatch_enabled: boolean;
      }>('/admin/dispatch/auto-assign-all');

      if (res.data.total_unassigned === 0) {
        toast.info('Không có hồ sơ nào đang chờ phân bổ trong hàng đợi.');
      } else {
        toast.success(
          `Đã phân bổ tự động ${res.data.successfully_dispatched}/${res.data.total_unassigned} hồ sơ cho các chuyên viên thẩm định phù hợp!`
        );
      }
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Phân bổ tự động thất bại');
    } finally {
      setDispatching(false);
    }
  };

  const handleSignOffSubmit = async () => {
    if (!signOffModal.claim) return;
    setSubmittingSignOff(true);
    try {
      await api.post(`/admin/claims/${signOffModal.claim.claim_id}/approve-high-value`, {
        approved: signOffModal.approved,
        notes: signOffModal.notes,
      });

      toast.success(
        signOffModal.approved
          ? `Đã ký duyệt chi cấp 2 cho hồ sơ ${signOffModal.claim.claim_id}. Trạng thái thanh toán đã mở khoá để giải ngân!`
          : `Đã từ chối duyệt chi và trả hồ sơ ${signOffModal.claim.claim_id} về cho Thẩm định viên xem xét lại.`
      );
      setSignOffModal({ open: false, claim: null, approved: true, notes: '' });
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xử lý ký duyệt chi thất bại');
    } finally {
      setSubmittingSignOff(false);
    }
  };

  const handleSaveReviewerProfile = async () => {
    if (!reviewerModal.user) return;
    setSavingReviewer(true);
    try {
      await api.put(`/admin/reviewers/${reviewerModal.user.id}/profile`, {
        specializations: reviewerModal.specializations,
        max_active_claims: reviewerModal.maxQuota,
      });
      toast.success(`Đã cập nhật chuyên môn & hạn mức thẩm định cho ${reviewerModal.user.email}!`);
      setReviewerModal({ open: false, user: null, specializations: [], maxQuota: 10 });
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Cập nhật reviewer thất bại');
    } finally {
      setSavingReviewer(false);
    }
  };

  const toggleSpecialization = (spec: string) => {
    setReviewerModal((prev) => {
      const exists = prev.specializations.includes(spec);
      return {
        ...prev,
        specializations: exists
          ? prev.specializations.filter((s) => s !== spec)
          : [...prev.specializations, spec],
      };
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin text-blue-600 mb-3" size={32} />
        <p className="text-sm font-medium">Đang tải cấu hình thẩm định & hàng chờ duyệt...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Top Summary Header: Deep Harbor Pier ───────────────────────────── */}
      <div className="bg-[#13426f] text-white border border-[#0d2d4c] rounded-[26px] p-7 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="bg-[#2e96ff]/20 text-[#2e96ff] text-xs px-3 py-0.5 rounded-full font-bold border border-[#2e96ff]/30">
                Enterprise Underwriting & Dispatch
              </span>
              <span className="text-xs text-white/70">
                Cập nhật: {rules.updated_at ? new Date(rules.updated_at).toLocaleString('vi-VN') : 'Mặc định hệ thống'}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Quy tắc Thẩm định & Phân bổ Thông minh</h2>
            <p className="text-sm text-white/80 mt-1 max-w-2xl leading-relaxed">
              Cấu hình tự động duyệt bồi thường (STP), cơ chế 2 cấp duyệt chi (Four-Eyes Principle) và thuật toán tự động phân bổ hồ sơ theo năng lực thẩm định viên.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              onClick={handleAutoDispatchAll}
              disabled={dispatching}
              className="bg-[#2e96ff] text-white hover:bg-[#2582df] font-bold rounded-full shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-[1px] active:shadow-xs text-sm px-5 py-2.5"
            >
              {dispatching ? (
                <Loader2 size={16} className="animate-spin mr-2 text-white" />
              ) : (
                <Sparkles size={16} className="mr-2 text-white" />
              )}
              Phân bổ tự động hồ sơ chờ
            </Button>
            <Button
              onClick={loadData}
              variant="outline"
              size="sm"
              className="bg-white hover:bg-[#eef6ff] text-black font-bold border border-white/60 rounded-full px-4 shadow-xs"
            >
              <RefreshCw size={13} className="mr-1.5 text-black" /> Làm mới
            </Button>
          </div>
        </div>

        {/* Quick status chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10">
            <p className="text-xs text-white/70 font-medium">Duyệt tự động (STP)</p>
            <p className="text-base font-bold mt-0.5 flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${rules.stp_enabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {rules.stp_enabled ? 'Đang bật' : 'Tạm tắt'}
            </p>
            <p className="text-[11px] text-white/70 mt-0.5 font-mono">Tối đa: {rules.max_stp_amount.toLocaleString('vi-VN')} đ</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10">
            <p className="text-xs text-white/70 font-medium">Ngưỡng Four-Eyes (Cấp 2)</p>
            <p className="text-base font-bold mt-0.5 text-amber-300 font-mono">
              {rules.high_value_threshold.toLocaleString('vi-VN')} đ
            </p>
            <p className="text-[11px] text-white/70 mt-0.5">Cần Admin ký duyệt chi</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10">
            <p className="text-xs text-white/70 font-medium">Hồ sơ chờ Admin ký duyệt</p>
            <p className={`text-base font-bold mt-0.5 ${pendingClaims.length > 0 ? 'text-rose-300' : 'text-emerald-400'}`}>
              {pendingClaims.length} hồ sơ
            </p>
            <p className="text-[11px] text-white/70 mt-0.5">{pendingClaims.length > 0 ? 'Cần xử lý ngay' : 'Đã ký hết'}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10">
            <p className="text-xs text-white/70 font-medium">Phân bổ thông minh</p>
            <p className="text-base font-bold mt-0.5 flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${rules.auto_dispatch_enabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {rules.auto_dispatch_enabled ? 'Tự động gán' : 'Thủ công (Pull)'}
            </p>
            <p className="text-[11px] text-white/70 mt-0.5">{reviewers.length} Thẩm định viên</p>
          </div>
        </div>
      </div>

      {/* ── Section 1: Hàng chờ Ký duyệt chi Cấp 2 (Four-Eyes Sign-Off) ───── */}
      <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#d0d5dd]/60 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs">
                <ShieldAlert size={18} />
              </div>
              <h3 className="text-lg font-bold text-[#13426f]">
                Hàng chờ Ký duyệt chi Cấp 2 (Four-Eyes Principle)
              </h3>
              {pendingClaims.length > 0 && (
                <span className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-0.5 rounded-full">
                  {pendingClaims.length} cần ký
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Hồ sơ bồi thường có số tiền duyệt ≥ {rules.high_value_threshold.toLocaleString('vi-VN')} đ đã qua Thẩm định viên xét duyệt, cần Ban Giám đốc ký duyệt chi trước khi thực hiện lệnh chuyển khoản.
            </p>
          </div>
        </div>

        {pendingClaims.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <ShieldCheck size={44} className="mx-auto text-emerald-500 mb-2 opacity-80" />
            <p className="text-sm font-semibold text-gray-700">Không có hồ sơ giá trị cao nào đang chờ ký duyệt</p>
            <p className="text-xs text-gray-400 mt-1">
              Mọi yêu cầu bồi thường giá trị lớn đều đã được ký duyệt hoặc chưa có phát sinh mới.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 mt-2">
            {pendingClaims.map((item) => (
              <div
                key={item.claim_id}
                className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 p-3 rounded-xl transition-colors"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      #{item.claim_id}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {CLAIM_TYPE_LABELS[item.claim_type]?.icon} {CLAIM_TYPE_LABELS[item.claim_type]?.label || item.claim_type}
                    </span>
                    <span className="text-xs text-gray-400">
                      Ngày tạo: {new Date(item.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  <div className="text-sm">
                    <span className="font-semibold text-gray-900">{item.claimant_name || 'Khách hàng'}</span>
                    <span className="text-gray-400 text-xs ml-2">({item.claimant_email})</span>
                  </div>

                  {item.reviewer_note && (
                    <div className="text-xs bg-amber-50/80 border border-amber-200 text-amber-900 p-2.5 rounded-lg">
                      <span className="font-semibold">Ý kiến Thẩm định viên ({item.reviewer_name || item.reviewer_email}): </span>
                      {item.reviewer_note}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-8">
                  <div className="text-right sm:min-w-[140px]">
                    <p className="text-xs text-gray-400">Số tiền đề xuất duyệt:</p>
                    <p className="text-xl font-extrabold text-emerald-600">
                      {item.amount_approved.toLocaleString('vi-VN')} đ
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Yêu cầu gốc: {item.amount_claimed.toLocaleString('vi-VN')} đ
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                      onClick={() =>
                        setSignOffModal({
                          open: true,
                          claim: item,
                          approved: true,
                          notes: 'Đã đối soát chứng từ & hồ sơ bồi thường hợp lệ. Phê duyệt chi trả.',
                        })
                      }
                    >
                      <CheckCheck size={16} className="mr-1.5" /> Ký duyệt chi
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() =>
                        setSignOffModal({
                          open: true,
                          claim: item,
                          approved: false,
                          notes: '',
                        })
                      }
                    >
                      <XCircle size={16} className="mr-1.5" /> Trả về xét lại
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Cấu hình Quy tắc Thẩm định Đa tầng (STP & Underwriting) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6 bg-white border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-[#eef6ff] border border-[#2e96ff]/20 flex items-center justify-center text-[#2e96ff] shadow-2xs">
                <Sliders size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#13426f]">Quy tắc Duyệt Tự động (STP)</h3>
                <p className="text-xs text-gray-500">Straight-Through Processing không cần can thiệp thủ công</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={rules.stp_enabled}
                onChange={(e) => setRules({ ...rules, stp_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2e96ff]"></div>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs font-bold text-gray-700">
                  Hạn mức bồi thường STP tối đa (VNĐ)
                </Label>
                <span className="text-xs font-bold text-[#2e96ff]">
                  {rules.max_stp_amount.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <Input
                type="number"
                step={500000}
                min={0}
                value={rules.max_stp_amount}
                onChange={(e) => setRules({ ...rules, max_stp_amount: Number(e.target.value) || 0 })}
                className="font-medium rounded-full border border-[#d0d5dd] px-4"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Hồ sơ có số tiền yêu cầu vượt quá hạn mức này sẽ tự động chuyển sang xét duyệt thủ công.
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs font-bold text-gray-700">
                  Điểm rủi ro AI tối đa cho phép duyệt tự động
                </Label>
                <span className="text-xs font-bold text-[#2e96ff]">
                  {rules.max_stp_fraud_score} / 100
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={rules.max_stp_fraud_score}
                onChange={(e) => setRules({ ...rules, max_stp_fraud_score: Number(e.target.value) })}
                className="w-full accent-[#2e96ff]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Hồ sơ có điểm rủi ro gian lận lớn hơn {rules.max_stp_fraud_score} sẽ bị chặn duyệt tức thì.
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs font-bold text-gray-700">
                  Độ tin cậy nhận diện OCR tối thiểu (%)
                </Label>
                <span className="text-xs font-bold text-[#2e96ff]">
                  {rules.min_ocr_confidence}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                value={rules.min_ocr_confidence}
                onChange={(e) => setRules({ ...rules, min_ocr_confidence: Number(e.target.value) })}
                className="w-full accent-[#2e96ff]"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Các chứng từ hoá đơn/giấy tờ có độ tự tin trích xuất dữ liệu dưới {rules.min_ocr_confidence}% cần reviewer kiểm tra mắt.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)] space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-[#d0d5dd]/60">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#13426f]">Cơ chế Kiểm soát Kép (Four-Eyes Principle)</h3>
                <p className="text-xs text-gray-500">Phê duyệt 2 cấp cho các khoản chi bồi thường lớn</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs font-bold text-gray-700">
                  Ngưỡng giá trị lớn yêu cầu Admin ký duyệt chi (VNĐ)
                </Label>
                <span className="text-xs font-bold text-amber-600">
                  {rules.high_value_threshold.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <Input
                type="number"
                step={5000000}
                min={10000000}
                value={rules.high_value_threshold}
                onChange={(e) => setRules({ ...rules, high_value_threshold: Number(e.target.value) || 0 })}
                className="font-medium rounded-full border border-[#d0d5dd] px-4"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Khi Thẩm định viên bấm Duyệt hồ sơ $\ge$ {rules.high_value_threshold.toLocaleString('vi-VN')} đ, trạng thái chi trả bị tạm khoá và chuyển sang hàng chờ Ký duyệt chi của Ban Quản trị.
              </p>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold text-gray-700">
                  Bật phân bổ thông minh tự động (Auto-assignment)
                </Label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rules.auto_dispatch_enabled}
                    onChange={(e) => setRules({ ...rules, auto_dispatch_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2e96ff]"></div>
                </label>
              </div>
              <p className="text-[11px] text-gray-400">
                Tự động tìm kiếm chuyên viên phù hợp với loại hình bồi thường (Xe, Y tế, Tài sản) và có tải công việc hiện tại thấp nhất để gán hồ sơ.
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <Button
                onClick={handleSaveRules}
                disabled={savingRules}
                className="bg-[#2e96ff] hover:bg-[#2582df] text-white font-bold rounded-full shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-[1px] active:shadow-xs px-6 py-2.5 transition-all text-xs md:text-sm"
              >
                {savingRules && <Loader2 size={16} className="animate-spin mr-2" />}
                Lưu cấu hình quy tắc thẩm định
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Phân bổ Hồ sơ Thông minh & Đội ngũ Thẩm định viên ────── */}
      <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                <UserCheck size={18} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Đội ngũ Thẩm định viên & Quản lý Năng lực (Reviewer Capacity)
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Phân loại chuyên môn giám định và thiết lập hạn mức số lượng hồ sơ đang thụ lý tối đa (Workload Quota) cho từng người.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAutoDispatchAll}
              disabled={dispatching}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              {dispatching ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
              Phân bổ lại toàn bộ hàng chờ
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-gray-600 font-semibold border-b">
              <tr>
                <th className="text-left px-4 py-3">Thẩm định viên</th>
                <th className="text-left px-4 py-3">Chuyên môn bồi thường</th>
                <th className="text-center px-4 py-3">Tải hồ sơ hiện tại</th>
                <th className="text-center px-4 py-3">Hạn mức (Quota)</th>
                <th className="text-right px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviewers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    Chưa có tài khoản reviewer nào trong hệ thống.
                  </td>
                </tr>
              ) : (
                reviewers.map((rev) => {
                  const quotaPercent = Math.min(
                    100,
                    Math.round(((rev.active_claims_count || 0) / (rev.max_active_claims || 10)) * 100)
                  );
                  return (
                    <tr key={rev.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-gray-900">{rev.full_name || rev.email}</div>
                        <div className="text-xs text-gray-400 font-mono">{rev.email}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {rev.specializations && rev.specializations.length > 0 ? (
                            rev.specializations.map((s) => (
                              <span
                                key={s}
                                className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-medium"
                              >
                                {CLAIM_TYPE_LABELS[s]?.icon} {CLAIM_TYPE_LABELS[s]?.label || s}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400 italic">Đa năng (Tất cả loại hình)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-xs font-bold text-gray-800">
                            {rev.active_claims_count || 0} / {rev.max_active_claims || 10}
                          </span>
                          <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${
                                quotaPercent >= 90
                                  ? 'bg-rose-500'
                                  : quotaPercent >= 60
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${quotaPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-gray-700">
                        {rev.max_active_claims || 10} hồ sơ
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() =>
                            setReviewerModal({
                              open: true,
                              user: rev,
                              specializations: rev.specializations || [],
                              maxQuota: rev.max_active_claims || 10,
                            })
                          }
                        >
                          Cấu hình năng lực
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Ký duyệt chi Cấp 2 (Sign-Off Modal) ──────────────────────── */}
      {signOffModal.open && signOffModal.claim && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {signOffModal.approved ? 'Ký duyệt chi bồi thường (Admin Sign-Off)' : 'Từ chối / Yêu cầu thẩm định lại'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mã hồ sơ: #{signOffModal.claim.claim_id} • Khách hàng: {signOffModal.claim.claimant_name || signOffModal.claim.claimant_email}
                </p>
              </div>
              <button
                onClick={() => setSignOffModal({ open: false, claim: null, approved: true, notes: '' })}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl space-y-2 border">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Số tiền bồi thường được duyệt:</span>
                <span className="font-extrabold text-emerald-600 text-lg">
                  {signOffModal.claim.amount_approved.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Thẩm định viên ký cấp 1:</span>
                <span className="font-medium text-gray-800">
                  {signOffModal.claim.reviewer_name || signOffModal.claim.reviewer_email}
                </span>
              </div>
              {signOffModal.claim.reviewer_note && (
                <div className="text-xs text-gray-600 pt-2 border-t mt-2">
                  <span className="font-medium text-gray-700">Ghi chú giám định: </span>
                  {signOffModal.claim.reviewer_note}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-700">
                {signOffModal.approved ? 'Ghi chú phê duyệt chi (Tùy chọn)' : 'Lý do trả về thẩm định lại (Bắt buộc)'}
              </Label>
              <textarea
                value={signOffModal.notes}
                onChange={(e) => setSignOffModal({ ...signOffModal, notes: e.target.value })}
                placeholder={
                  signOffModal.approved
                    ? 'Ví dụ: Đã đối chiếu hoá đơn gốc và kiểm tra hạn mức hợp đồng, phê duyệt giải ngân...'
                    : 'Nêu rõ lý do từ chối chi trả hoặc điểm nghi vấn cần giám định lại...'
                }
                rows={3}
                className="w-full text-sm p-3 border rounded-xl mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setSignOffModal({ open: false, claim: null, approved: true, notes: '' })}
              >
                Hủy bỏ
              </Button>
              <Button
                onClick={handleSignOffSubmit}
                disabled={submittingSignOff || (!signOffModal.approved && !signOffModal.notes.trim())}
                className={
                  signOffModal.approved
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium'
                    : 'bg-rose-600 hover:bg-rose-700 text-white font-medium'
                }
              >
                {submittingSignOff && <Loader2 size={16} className="animate-spin mr-2" />}
                {signOffModal.approved ? 'Xác nhận Ký duyệt chi' : 'Xác nhận Trả về'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Cấu hình Chuyên môn & Hạn mức Reviewer ──────────────────── */}
      {reviewerModal.open && reviewerModal.user && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Cấu hình Năng lực Thẩm định viên</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{reviewerModal.user.email}</p>
              </div>
              <button
                onClick={() => setReviewerModal({ open: false, user: null, specializations: [], maxQuota: 10 })}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-2 block">
                  Chuyên môn bồi thường phụ trách:
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'vehicle', label: 'Xe cơ giới', icon: '🚗' },
                    { key: 'health', label: 'Sức khỏe & Y tế', icon: '🏥' },
                    { key: 'property', label: 'Tài sản & Cháy nổ', icon: '🏢' },
                    { key: 'disaster', label: 'Thiên tai bão lũ', icon: '🌊' },
                  ].map(({ key, label, icon }) => {
                    const selected = reviewerModal.specializations.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSpecialization(key)}
                        className={`p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                          selected
                            ? 'bg-blue-50 border-blue-500 text-blue-800'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{icon}</span> {label}
                        </span>
                        {selected && <Check size={14} className="text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Nếu không chọn chuyên môn nào, hệ thống xem như chuyên viên đa năng tiếp nhận tất cả các loại hồ sơ.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-xs font-semibold text-gray-700">
                    Hạn mức hồ sơ đang mở tối đa (Quota):
                  </Label>
                  <span className="text-xs font-bold text-blue-600">{reviewerModal.maxQuota} hồ sơ</span>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={reviewerModal.maxQuota}
                  onChange={(e) =>
                    setReviewerModal({ ...reviewerModal, maxQuota: Number(e.target.value) || 10 })
                  }
                  className="font-medium"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Khi số lượng hồ sơ đang mở đạt ngưỡng này, hệ thống sẽ không tự động điều phối thêm việc để tránh quá tải.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setReviewerModal({ open: false, user: null, specializations: [], maxQuota: 10 })}
              >
                Hủy bỏ
              </Button>
              <Button
                onClick={handleSaveReviewerProfile}
                disabled={savingReviewer}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
              >
                {savingReviewer && <Loader2 size={16} className="animate-spin mr-2" />}
                Lưu cấu hình
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
