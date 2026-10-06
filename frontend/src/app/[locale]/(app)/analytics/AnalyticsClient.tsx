'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, BarChart3, Calendar, CheckCircle, Clock, CreditCard,
  DollarSign, FileText, Heart, Home, Info, Layers, Loader2, MapPin,
  RefreshCw, Shield, ShieldAlert, Sparkles, TrendingUp, User, Wallet,
  XCircle, ChevronDown, Car,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import type { User as UserType } from '@/types';
import { EnterpriseAdminAnalytics } from '../admin/EnterpriseAdminAnalytics';

interface SummaryData {
  scope: 'all' | 'user';
  period: string;
  selected_year: number;
  selected_month: number;
  available_years: number[];
  // Claims
  total_claims: number;
  approved: number;
  rejected: number;
  manual_review: number;
  processing: number;
  approval_rate: number;
  avg_processing_minutes: number;
  total_claimed_amount: number;
  total_approved_amount: number;
  claim_types: Record<string, number>;
  disaster_types: Array<[string, number]>;
  // Policies & Financials
  total_policies: number;
  active_policies: number;
  expired_policies: number;
  cancelled_policies: number;
  total_coverage_amount: number;
  total_annual_premium: number;
  total_paid_premium: number;
  pending_payment_amount: number;
  family_members_count: number;
  policy_types: Record<string, number>;
  // Documents
  total_documents: number;
  avg_ocr_confidence: number;
  doc_types: Record<string, number>;
  // Geo
  user_province?: string;
  user_region?: string;
  province_risk_score?: number;
  province_disasters?: Array<{ type: string; risk_score: number }>;
}

interface TimelinePoint {
  label: string;
  full_label: string;
  date: string;
  claims_count: number;
  approved_count: number;
  claimed_amount: number;
  approved_amount: number;
  premium_paid: number;
}

interface TimelineData {
  period: string;
  year: number;
  month: number;
  points: TimelinePoint[];
  total_claims: number;
  total_approved_amount: number;
  total_claimed_amount: number;
  total_premium_paid: number;
}

interface ActivityItem {
  type: 'claim' | 'policy' | 'payment';
  title: string;
  desc: string;
  status: string;
  timestamp: string | null;
  amount?: number;
}

type PeriodMode = 'all' | 'year' | 'month' | '30d' | '7d';

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtShortVND(n: number) {
  if (!n) return '0 ₫';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n} ₫`;
}

const POLICY_NAMES: Record<string, { label: string; icon: any; color: string }> = {
  health: { label: 'Sức khỏe', icon: Heart, color: 'bg-rose-500' },
  life: { label: 'Nhân thọ', icon: Shield, color: 'bg-blue-500' },
  property: { label: 'Tài sản', icon: Home, color: 'bg-emerald-500' },
  vehicle: { label: 'Xe cơ giới', icon: Car, color: 'bg-amber-500' },
  disaster: { label: 'Thiên tai', icon: AlertTriangle, color: 'bg-orange-500' },
  income: { label: 'Thu nhập', icon: Wallet, color: 'bg-purple-500' },
};

export function AnalyticsClient() {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<UserType>('/auth/me');
        setCurrentUser(res.data);
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-xs text-slate-500 font-medium">Đang tải dữ liệu phân tích...</p>
      </div>
    );
  }

  // Admin và Reviewer xem bảng phân tích điều hành toàn hệ thống (Loss Ratio, Doanh thu phí, STP, Hiệu suất)
  if (currentUser?.role === 'admin' || currentUser?.role === 'reviewer') {
    return (
      <div className="space-y-6 pb-12">
        {currentUser.role === 'reviewer' && (
          <ReviewerAnalyticsOverview user={currentUser} />
        )}
        <EnterpriseAdminAnalytics />
      </div>
    );
  }

  // Khách hàng cá nhân xem danh mục hợp đồng & quyền lợi cá nhân
  return <UserPersonalAnalyticsView />;
}

function ReviewerAnalyticsOverview({ user }: { user: UserType }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reviewer/stats')
      .then((res) => setStats(res.data))
      .catch((err) => console.warn('Failed to load reviewer stats', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) return null;

  return (
    <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 shadow-lg space-y-4 border border-blue-800/60">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono">
              Reviewer Cockpit
            </span>
            <span className="text-xs text-blue-200">
              Giám định viên: <strong className="text-white">{user.full_name || user.email}</strong>
            </span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">
            Chỉ Số Hiệu Suất Thẩm Định & Cockpit Giám Định Viên
          </h2>
        </div>
        <a
          href="/reviewer"
          className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl transition-colors shadow-sm shrink-0"
        >
          Hàng đợi cần duyệt ({stats.pending_in_queue || 0})
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/10">
          <p className="text-[11px] text-blue-200">Duyệt hôm nay</p>
          <p className="text-xl font-bold text-white mt-0.5">{stats.reviewed_today ?? 0}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/10">
          <p className="text-[11px] text-blue-200">Duyệt tuần này</p>
          <p className="text-xl font-bold text-white mt-0.5">{stats.reviewed_week ?? 0}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/10">
          <p className="text-[11px] text-blue-200">Tổng ca đã duyệt</p>
          <p className="text-xl font-bold text-white mt-0.5">{stats.reviewed_total ?? 0}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/10">
          <p className="text-[11px] text-blue-200">Thời gian TB (SLA)</p>
          <p className="text-xl font-bold text-emerald-400 mt-0.5">{stats.avg_review_time_minutes ?? 0}m</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/10">
          <p className="text-[11px] text-blue-200">Tỷ lệ Can thiệp AI</p>
          <p className="text-xl font-bold text-amber-400 mt-0.5">{stats.override_rate ?? 0}%</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/10">
          <p className="text-[11px] text-blue-200">Chờ duyệt trong queue</p>
          <p className="text-xl font-bold text-rose-400 mt-0.5">{stats.pending_in_queue ?? 0}</p>
        </div>
      </div>
    </div>
  );
}

function UserPersonalAnalyticsView() {
  const t = useTranslations('analytics');
  const tCommon = useTranslations('common');

  // Filter states: Year / Month / Day
  const [period, setPeriod] = useState<PeriodMode>('year');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(7); // Default to month 7 where active claims/policies exist

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<'amount' | 'count'>('amount');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, timeRes, actRes] = await Promise.all([
        api.get<SummaryData>('/analytics/summary', {
          params: { period, year: selectedYear, month: selectedMonth },
        }),
        api.get<TimelineData>('/analytics/timeline', {
          params: { period, year: selectedYear, month: selectedMonth },
        }),
        api.get<ActivityItem[]>('/analytics/activity', {
          params: { limit: 12 },
        }),
      ]);
      setSummary(sumRes.data);
      setTimeline(timeRes.data);
      setActivities(actRes.data);
    } catch (e) {
      console.error('Failed to load analytics', e);
    } finally {
      setLoading(false);
    }
  }, [period, selectedYear, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const yearsList = summary?.available_years && summary.available_years.length > 0
    ? summary.available_years
    : [2026, 2025, 2024];

  // Months array 1..12
  const monthsList = Array.from({ length: 12 }, (_, i) => i + 1);

  if (loading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="animate-spin text-[#2e96ff]" size={32} />
        <p className="text-xs text-[#333333]/60 font-medium">Đang trích xuất & tổng hợp số liệu tài khoản...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── HEADER & TIME DIMENSION SELECTOR ──────────────────────────────── */}
      <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-card flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-[#13426f] text-white flex items-center justify-center font-bold shadow-xs">
              <BarChart3 size={18} />
            </div>
            <h1 className="text-xl font-bold text-[#13426f] tracking-tight">
              Trung tâm Phân tích & Báo cáo Cá nhân
            </h1>
          </div>
          <p className="text-xs text-[#333333]/70">
            Tổng hợp dữ liệu hợp đồng bảo hiểm, chi phí đóng, bồi thường chi trả và rủi ro địa phương theo thời gian
          </p>
        </div>

        {/* Time Selector Controls (Năm, Tháng, Ngày, Toàn thời gian) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Period Buttons */}
          <div className="flex items-center bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd]">
            <button
              onClick={() => setPeriod('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                period === 'all' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#333333]/70 hover:text-[#13426f]'
              }`}
            >
              Toàn thời gian
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                period === 'year' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#333333]/70 hover:text-[#13426f]'
              }`}
            >
              Theo Năm
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                period === 'month' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#333333]/70 hover:text-[#13426f]'
              }`}
            >
              Theo Tháng
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                period === '30d' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#333333]/70 hover:text-[#13426f]'
              }`}
            >
              30 ngày qua
            </button>
            <button
              onClick={() => setPeriod('7d')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                period === '7d' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#333333]/70 hover:text-[#13426f]'
              }`}
            >
              7 ngày qua
            </button>
          </div>

          {/* Year Dropdown (visible when 'year' or 'month' selected) */}
          {(period === 'year' || period === 'month') && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] text-xs font-bold text-[#333333] focus:bg-white focus:border-[#2e96ff] outline-hidden cursor-pointer"
            >
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </select>
          )}

          {/* Month Dropdown (visible when 'month' selected) */}
          {period === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-[#f9f7f0] text-xs font-bold text-[#333333] focus:bg-white focus:border-[#2e96ff] outline-hidden cursor-pointer"
            >
              {monthsList.map((m) => (
                <option key={m} value={m}>
                  Tháng {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 rounded-full border-[#d0d5dd] bg-white text-[#13426f] hover:bg-[#f9f7f0] hover:shadow-pop-xs cursor-pointer gap-1.5 font-bold"
            title="Làm mới số liệu"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-[#2e96ff]' : ''} />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
        </div>
      </div>

      {summary && (
        <>
          {/* ── 4 PRIMARY FINANCIAL & PROTECTION KPIS ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Coverage */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-card hover:shadow-pop hover:border-[#2e96ff] transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#333333]/70 uppercase tracking-wider">
                  Tổng quyền lợi bảo vệ
                </span>
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#2e96ff] flex items-center justify-center font-bold">
                  <Shield size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-[#13426f] tracking-tight">
                  {fmtVND(summary.total_coverage_amount)}
                </div>
                <p className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <CheckCircle size={12} />
                  <span>{summary.active_policies} gói bảo hiểm đang kích hoạt</span>
                </p>
                <p className="text-[10px] text-[#333333]/50 mt-0.5">
                  Bảo vệ cho {summary.family_members_count} người trong gia đình
                </p>
              </div>
            </div>

            {/* Card 2: Total Approved Claims */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-card hover:shadow-pop hover:border-[#2e96ff] transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#333333]/70 uppercase tracking-wider">
                  Bồi thường đã chi trả
                </span>
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <DollarSign size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-600 tracking-tight">
                  {fmtVND(summary.total_approved_amount)}
                </div>
                <p className="text-[11px] text-[#333333]/70 font-medium mt-1">
                  Đã duyệt <span className="font-bold text-[#13426f]">{summary.approved}</span>/{summary.total_claims} hồ sơ ({summary.approval_rate}%)
                </p>
                <p className="text-[10px] text-[#333333]/50 mt-0.5">
                  Tổng yêu cầu: {fmtVND(summary.total_claimed_amount)}
                </p>
              </div>
            </div>

            {/* Card 3: Premiums Paid */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-card hover:shadow-pop hover:border-[#2e96ff] transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#333333]/70 uppercase tracking-wider">
                  Phí bảo hiểm đã đóng
                </span>
                <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <CreditCard size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-600 tracking-tight">
                  {fmtVND(summary.total_paid_premium || summary.total_annual_premium)}
                </div>
                <p className="text-[11px] text-[#333333]/70 font-medium mt-1">
                  Phí duy trì: <span className="font-bold text-[#13426f]">{fmtVND(summary.total_annual_premium)}</span>/năm
                </p>
                <p className="text-[10px] text-[#333333]/50 mt-0.5">
                  Tổng cộng {summary.total_policies} hợp đồng đã ký kết
                </p>
              </div>
            </div>

            {/* Card 4: AI Turnaround Speed */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-card hover:shadow-pop hover:border-[#2e96ff] transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#333333]/70 uppercase tracking-wider">
                  Tốc độ xử lý AI
                </span>
                <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <Clock size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-purple-600 tracking-tight">
                  {summary.avg_processing_minutes > 0 ? `${summary.avg_processing_minutes} phút` : 'Vài giây'}
                </div>
                <p className="text-[11px] text-purple-700 font-semibold mt-1 flex items-center gap-1">
                  <Sparkles size={12} />
                  <span>Xử lý & giải ngân tức thì</span>
                </p>
                <p className="text-[10px] text-[#333333]/50 mt-0.5">
                  OCR tài liệu tin cậy: {summary.avg_ocr_confidence}%
                </p>
              </div>
            </div>
          </div>

          {/* ── INTERACTIVE TIMELINE CHART (NĂM / THÁNG / NGÀY) ──────────────── */}
          <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-[#13426f] flex items-center gap-2">
                  <TrendingUp size={16} className="text-[#2e96ff]" />
                  Biểu đồ Diễn biến Tài chính & Bồi thường theo Thời gian
                </h3>
                <p className="text-xs text-[#333333]/70 mt-0.5">
                  {period === 'year'
                    ? `Theo dõi chi tiết 12 tháng trong Năm ${selectedYear}`
                    : period === 'month'
                    ? `Theo dõi từng ngày trong Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
                    : period === '30d'
                    ? '30 ngày gần nhất'
                    : period === '7d'
                    ? '7 ngày gần nhất'
                    : 'Toàn bộ dòng lịch sử tài khoản'}
                </p>
              </div>

              {/* Metric Toggle Buttons */}
              <div className="flex items-center bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd] text-xs">
                <button
                  onClick={() => setChartMetric('amount')}
                  className={`px-3.5 py-1.5 rounded-full font-bold transition-all cursor-pointer ${
                    chartMetric === 'amount'
                      ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                      : 'text-[#333333]/70 hover:text-[#13426f]'
                  }`}
                >
                  💵 Số tiền (VNĐ)
                </button>
                <button
                  onClick={() => setChartMetric('count')}
                  className={`px-3.5 py-1.5 rounded-full font-bold transition-all cursor-pointer ${
                    chartMetric === 'count'
                      ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                      : 'text-[#333333]/70 hover:text-[#13426f]'
                  }`}
                >
                  📄 Số lượng hồ sơ
                </button>
              </div>
            </div>

            {/* Timeline SVG Chart */}
            {timeline && timeline.points.length > 0 ? (
              <div>
                <TimelineChart points={timeline.points} metric={chartMetric} />
                <div className="flex flex-wrap items-center justify-between text-xs text-[#333333]/60 pt-3 border-t border-[#d0d5dd]/40 mt-4">
                  <div className="flex items-center gap-4">
                    {chartMetric === 'amount' ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-emerald-500" />
                          <span className="font-semibold text-[#333333]">Tiền bồi thường đã nhận</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#2e96ff]" />
                          <span className="font-semibold text-[#333333]">Phí bảo hiểm đã đóng</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#2e96ff]" />
                          <span className="font-semibold text-[#333333]">Tổng hồ sơ bồi thường</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-emerald-500" />
                          <span className="font-semibold text-[#333333]">Hồ sơ đã được phê duyệt</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] font-bold text-[#13426f]">
                    Khoảng thời gian: {timeline.points[0]?.label} → {timeline.points.at(-1)?.label}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[#333333]/40 text-xs">
                Không có dữ liệu phát sinh trong mốc thời gian đã chọn.
              </div>
            )}
          </div>

          {/* ── 2-COLUMN DETAILS: PORTFOLIO BREAKDOWN & CLAIMS PIPELINE ──────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Column 1: Policy Types Distribution */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-card">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#d0d5dd]/40">
                <h3 className="text-sm font-bold text-[#13426f] flex items-center gap-2">
                  <Shield size={16} className="text-[#2e96ff]" />
                  Cơ cấu Danh mục Bảo vệ ({summary.total_policies} Hợp đồng)
                </h3>
                <span className="text-[11px] font-bold text-[#13426f]">
                  {summary.active_policies} hiệu lực
                </span>
              </div>

              {Object.keys(summary.policy_types).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.policy_types).map(([type, count]) => {
                    const info = POLICY_NAMES[type] || { label: type, icon: Shield, color: 'bg-slate-500' };
                    const Icon = info.icon;
                    const pct = Math.round((count / summary.total_policies) * 100);
                    return (
                      <div key={type} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#333333] flex items-center gap-2">
                            <Icon size={14} className="text-[#333333]/60" />
                            {info.label}
                          </span>
                          <span className="text-[#333333] font-mono font-bold">
                            {count} gói ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-[#f9f7f0] border border-[#d0d5dd]/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${info.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-[#333333]/40 text-xs">
                  Bạn chưa đăng ký gói bảo hiểm nào.
                </div>
              )}
            </div>

            {/* Column 2: Claims Pipeline & Types */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-card">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#d0d5dd]/40">
                <h3 className="text-sm font-bold text-[#13426f] flex items-center gap-2">
                  <FileText size={16} className="text-emerald-600" />
                  Tình trạng Bồi thường & Trạng thái Xét duyệt
                </h3>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {summary.approved}/{summary.total_claims} Thành công
                </span>
              </div>

              {summary.total_claims > 0 ? (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50/80 border border-emerald-100 rounded-[16px] p-3">
                      <div className="text-lg font-black text-emerald-700 font-mono">{summary.approved}</div>
                      <div className="text-[10px] font-bold text-emerald-800 uppercase mt-0.5">Đã duyệt</div>
                    </div>
                    <div className="bg-amber-50/80 border border-amber-100 rounded-[16px] p-3">
                      <div className="text-lg font-black text-amber-700 font-mono">{summary.manual_review}</div>
                      <div className="text-[10px] font-bold text-amber-800 uppercase mt-0.5">Cần xét duyệt</div>
                    </div>
                    <div className="bg-rose-50/80 border border-rose-100 rounded-[16px] p-3">
                      <div className="text-lg font-black text-rose-700 font-mono">{summary.rejected}</div>
                      <div className="text-[10px] font-bold text-rose-800 uppercase mt-0.5">Từ chối</div>
                    </div>
                  </div>

                  {/* Claim Types Breakdown */}
                  <div className="space-y-2 pt-2 border-t border-[#d0d5dd]/40">
                    <div className="text-[11px] font-bold text-[#333333]/60 uppercase tracking-wider">
                      Phân loại hồ sơ bồi thường
                    </div>
                    {Object.entries(summary.claim_types).map(([type, count]) => {
                      const info = POLICY_NAMES[type] || { label: type };
                      const pct = Math.round((count / summary.total_claims) * 100);
                      return (
                        <div key={type} className="flex items-center justify-between text-xs py-1">
                          <span className="font-semibold text-[#333333]">{info.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#13426f]">{count} vụ</span>
                            <span className="text-[10px] text-[#333333]/50">({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-[#333333]/40 text-xs">
                  Chưa có yêu cầu bồi thường nào trong giai đoạn này.
                </div>
              )}
            </div>
          </div>

          {/* ── BOTTOM SECTION: REGIONAL RISK FOOTPRINT & RECENT TIMELINE ────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Regional Hazard Profile & Digitized Docs */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#d0d5dd]/40">
                  <h3 className="text-sm font-bold text-[#13426f] flex items-center gap-2">
                    <MapPin size={16} className="text-red-500" />
                    Chỉ số Rủi ro Địa phương & Kho Tài liệu Số hóa
                  </h3>
                  <span className="text-xs font-bold text-[#2e96ff]">
                    {summary.user_province || 'Toàn quốc'}
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Province Risk Meter */}
                  <div className="bg-[#f9f7f0] border border-[#d0d5dd] rounded-[18px] p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[#13426f]">
                        Chỉ số nguy cơ thiên tai tỉnh thành
                      </div>
                      <p className="text-[11px] text-[#333333]/70 mt-0.5">
                        {summary.province_risk_score && summary.province_risk_score >= 60
                          ? 'Vùng thường xuyên chịu bão lũ & triều cường'
                          : 'Khu vực an toàn, mức độ rủi ro trung bình - thấp'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-[#13426f] font-mono">
                        {summary.province_risk_score ?? 38}<span className="text-xs text-[#333333]/40">/100</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Cấp độ an toàn
                      </span>
                    </div>
                  </div>

                  {/* Document Vault Summary */}
                  <div className="border border-[#d0d5dd] rounded-[18px] p-3.5 space-y-2 bg-[#f9f7f0]/50">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#13426f] flex items-center gap-1.5">
                        <FileText size={13} className="text-[#2e96ff]" />
                        Tài liệu định danh & chứng từ đã OCR
                      </span>
                      <span className="font-mono font-black text-[#13426f]">
                        {summary.total_documents} tệp
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(summary.doc_types).map(([type, count]) => (
                        <span
                          key={type}
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-[#d0d5dd] text-[#333333]"
                        >
                          {type === 'cccd'
                            ? 'CCCD'
                            : type === 'vehicle_registration'
                            ? 'Giấy tờ xe'
                            : type === 'driver_license'
                            ? 'GPLX'
                            : type === 'insurance_policy'
                            ? 'HĐ Bảo hiểm'
                            : type}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Timeline Activity Feed */}
            <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-card">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#d0d5dd]/40">
                <h3 className="text-sm font-bold text-[#13426f] flex items-center gap-2">
                  <Clock size={16} className="text-[#2e96ff]" />
                  Dòng Hoạt động & Giao dịch Gần nhất
                </h3>
                <span className="text-[11px] font-bold text-[#333333]/50">
                  Ngày / Giờ chi tiết
                </span>
              </div>

              {activities.length > 0 ? (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                  {activities.map((act, idx) => {
                    const isClaim = act.type === 'claim';
                    const isPolicy = act.type === 'policy';
                    return (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 p-3 rounded-[16px] bg-[#f9f7f0] border border-[#d0d5dd]/60"
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                              isClaim
                                ? 'bg-emerald-100 text-emerald-700'
                                : isPolicy
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {isClaim ? '📄' : isPolicy ? '🛡️' : '💳'}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[#13426f]">{act.title}</div>
                            <div className="text-[11px] text-[#333333]/70">{act.desc}</div>
                            {act.timestamp && (
                              <div className="text-[10px] text-[#333333]/50 font-mono mt-0.5">
                                🕒 {new Date(act.timestamp).toLocaleString('vi-VN')}
                              </div>
                            )}
                          </div>
                        </div>
                        {act.amount && (
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black font-mono text-[#13426f]">
                              {fmtShortVND(act.amount)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-[#333333]/40 text-xs">
                  Chưa có hoạt động nào được ghi nhận.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── SUB-COMPONENT: TIMELINE SVG BAR CHART ────────────────────────────────────

function TimelineChart({
  points,
  metric,
}: {
  points: TimelinePoint[];
  metric: 'amount' | 'count';
}) {
  const maxVal = useMemo(() => {
    if (metric === 'amount') {
      return Math.max(1, ...points.map((p) => Math.max(p.approved_amount, p.premium_paid, p.claimed_amount)));
    }
    return Math.max(1, ...points.map((p) => Math.max(p.claims_count, p.approved_count)));
  }, [points, metric]);

  return (
    <div className="w-full">
      <div className="flex items-end gap-1 sm:gap-2 h-48 pt-6 pb-2">
        {points.map((pt, idx) => {
          const val1 = metric === 'amount' ? pt.approved_amount : pt.claims_count;
          const val2 = metric === 'amount' ? pt.premium_paid : pt.approved_count;

          const h1 = Math.round((val1 / maxVal) * 100);
          const h2 = Math.round((val2 / maxVal) * 100);

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col justify-end items-center h-full group relative cursor-pointer"
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-[#13426f] text-white text-[10px] font-mono px-3 py-2 rounded-[14px] shadow-xl pointer-events-none z-50 whitespace-nowrap min-w-[120px] border border-[#2e96ff]/30">
                <div className="font-bold text-[#2e96ff] pb-1 border-b border-white/10">
                  {pt.full_label || pt.date}
                </div>
                {metric === 'amount' ? (
                  <>
                    <div className="text-emerald-400 mt-1">Bồi thường: {fmtVND(pt.approved_amount)}</div>
                    <div className="text-[#2e96ff]">Phí đã đóng: {fmtVND(pt.premium_paid)}</div>
                  </>
                ) : (
                  <>
                    <div className="mt-1">Tổng yêu cầu: {pt.claims_count} vụ</div>
                    <div className="text-emerald-400">Đã duyệt: {pt.approved_count} vụ</div>
                  </>
                )}
              </div>

              {/* Side by side bars */}
              <div className="flex items-end gap-1 w-full justify-center h-full">
                {/* Bar 1: Approved / Claims */}
                <div
                  className={`w-full max-w-[16px] rounded-t-md transition-all duration-300 ${
                    metric === 'amount'
                      ? 'bg-emerald-500 group-hover:bg-emerald-400'
                      : 'bg-[#2e96ff] group-hover:bg-[#2e96ff]/80'
                  }`}
                  style={{ height: `${h1}%`, minHeight: val1 > 0 ? '4px' : '0' }}
                />

                {/* Bar 2: Premium / Approved count */}
                <div
                  className={`w-full max-w-[16px] rounded-t-md transition-all duration-300 ${
                    metric === 'amount'
                      ? 'bg-[#2e96ff] group-hover:bg-[#2e96ff]/80'
                      : 'bg-emerald-500 group-hover:bg-emerald-400'
                  }`}
                  style={{ height: `${h2}%`, minHeight: val2 > 0 ? '4px' : '0' }}
                />
              </div>

              {/* X Axis Label */}
              <span className="text-[10px] font-bold text-[#333333]/60 mt-2 truncate w-full text-center">
                {pt.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
