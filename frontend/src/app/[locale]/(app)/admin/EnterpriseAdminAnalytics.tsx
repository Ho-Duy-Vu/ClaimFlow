'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3,
  Calendar, CheckCircle, Clock, CreditCard, DollarSign, FileText,
  Heart, Home, Info, Layers, Loader2, MapPin, RefreshCw, Shield,
  ShieldAlert, ShieldCheck, Sparkles, TrendingDown, TrendingUp,
  User, Users, Wallet, XCircle, ChevronDown, CheckCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

export type AdminPeriodMode = 'all' | 'year' | 'quarter' | 'month' | 'week';

export interface QuarterlyStat {
  quarter: number;
  name: string;
  gwp: number;
  claims_paid: number;
  claims_count: number;
  loss_ratio: number;
}

export interface TimelinePoint {
  label: string;
  full_label: string;
  date: string;
  claims_count: number;
  approved_count: number;
  claimed_amount: number;
  approved_amount: number;
  premium_paid: number;
  loss_ratio?: number;
}

export interface FullAnalytics {
  period?: string;
  selected_year?: number;
  selected_quarter?: number;
  selected_month?: number;
  selected_week?: number;
  available_years?: number[];
  users: { total: number; active: number; reviewers: number };
  claims: {
    total: number;
    approved: number;
    rejected: number;
    manual_review: number;
    processing: number;
    approval_rate: number;
    fraud_rate: number;
  };
  financials?: {
    loss_ratio: number;
    total_paid_premium: number;
    total_approved_amount: number;
    total_claimed_amount: number;
    outstanding_reserves: number;
    fraud_prevented_amount: number;
    stp_rate: number;
  };
  quarterly_comparison?: QuarterlyStat[];
  timeline_points?: TimelinePoint[];
  daily_claims?: Array<{ date: string; count: number }>;
  top_high_risk_provinces: Array<{ name: string; region: string; risk_score: number }>;
  reviewer_performance: Array<{
    reviewer_id: string;
    email: string;
    full_name: string | null;
    total_reviewed: number;
    approved: number;
    rejected?: number;
    approval_rate: number;
  }>;
  region_breakdown: Record<string, number>;
}

function fmtVNDCompact(n: number) {
  if (!n) return '0 ₫';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n} ₫`;
}

export function EnterpriseAdminAnalytics() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');

  // Filter states
  const [period, setPeriod] = useState<AdminPeriodMode>('year');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(3); // Q3
  const [selectedMonth, setSelectedMonth] = useState<number>(7);
  const [selectedWeek, setSelectedWeek] = useState<number>(29);
  const [chartMetric, setChartMetric] = useState<'amount' | 'count' | 'loss_ratio'>('amount');

  const [data, setData] = useState<FullAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<FullAnalytics>('/admin/analytics/full', {
        params: {
          period,
          year: selectedYear,
          quarter: selectedQuarter,
          month: selectedMonth,
          week: selectedWeek,
        },
      });
      setData(r.data);
    } catch (e) {
      console.error('Failed to load admin analytics', e);
    } finally {
      setLoading(false);
    }
  }, [period, selectedYear, selectedQuarter, selectedMonth, selectedWeek]);

  useEffect(() => {
    load();
  }, [load]);

  const yearsList = data?.available_years ?? [2026, 2025, 2024];
  const monthsList = Array.from({ length: 12 }, (_, i) => i + 1);
  const weeksList = Array.from({ length: 52 }, (_, i) => i + 1);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-xs text-slate-500 font-medium">Đang tổng hợp dữ liệu điều hành doanh nghiệp...</p>
      </div>
    );
  }
  if (!data) return <div className="text-center text-gray-400 py-12">{tCommon('error')}</div>;

  const fin = data.financials ?? {
    loss_ratio: 0,
    total_paid_premium: 0,
    total_approved_amount: 0,
    total_claimed_amount: 0,
    outstanding_reserves: 0,
    fraud_prevented_amount: 0,
    stp_rate: 0,
  };

  const lrVal = fin.loss_ratio;
  const isLossHealthy = lrVal <= 65;
  const isLossModerate = lrVal > 65 && lrVal <= 85;

  const totalRegion = Object.values(data.region_breakdown).reduce((a, b) => a + b, 0) || 1;
  const timelinePoints = data.timeline_points ?? [];

  return (
    <div className="space-y-6">
      {/* ── HEADER & MULTI-DIMENSIONAL TIME CONTROLS ───────────────────────── */}
      <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#eef6ff] text-[#2e96ff] text-xs font-bold px-2.5 py-0.5 rounded-full border border-[#2e96ff]/20">
              Enterprise Cockpit
            </span>
            <span className="text-xs text-gray-400 font-medium">
              Số liệu chuẩn Actuary bảo hiểm
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#13426f] tracking-tight">
            Bảng Điều Hành Toàn Hệ Thống
          </h2>
          <p className="text-xs text-[#4a5568] mt-0.5">
            Báo cáo tổng hợp doanh thu phí bảo hiểm, bồi thường, tỷ lệ Loss Ratio và năng lực vận hành
          </p>
        </div>

        {/* Time Dimension Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Period Tabs: Relief Pill Container */}
          <div className="flex items-center bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd] overflow-x-auto">
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                period === 'all' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Toàn bộ
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                period === 'year' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Năm
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                period === 'quarter' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Quý (Q1..Q4)
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                period === 'month' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Tháng
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                period === 'week' ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]' : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Tuần
            </button>
          </div>

          {/* Year Dropdown */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-white text-xs font-bold text-[#13426f] shadow-2xs cursor-pointer"
          >
            {yearsList.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>

          {/* Quarter Pills */}
          {period === 'quarter' && (
            <div className="flex items-center bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd] text-xs font-bold">
              {[1, 2, 3, 4].map((q) => (
                <button
                  key={q}
                  onClick={() => setSelectedQuarter(q)}
                  className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                    selectedQuarter === q
                      ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                      : 'text-[#4a5568] hover:text-[#13426f]'
                  }`}
                >
                  Quý {q}
                </button>
              ))}
            </div>
          )}

          {/* Month Dropdown */}
          {period === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-white text-xs font-bold text-[#13426f] shadow-2xs cursor-pointer"
            >
              {monthsList.map((m) => (
                <option key={m} value={m}>
                  Tháng {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          )}

          {/* Week Dropdown */}
          {period === 'week' && (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="h-9 px-3.5 rounded-full border border-[#d0d5dd] bg-white text-xs font-bold text-[#13426f] shadow-2xs cursor-pointer"
            >
              {weeksList.map((w) => (
                <option key={w} value={w}>
                  Tuần {w}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-9 px-3.5 rounded-full border-[#d0d5dd] text-xs font-bold text-[#13426f] hover:bg-[#eef6ff] shadow-xs"
          >
            <RefreshCw size={13} className={`mr-1.5 text-[#2e96ff] ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* ── ROW 1: CORE INSURANCE FINANCIAL METRICS ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Loss Ratio Card */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Tỷ Lệ Bồi Thường (Loss Ratio)
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isLossHealthy
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isLossModerate
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {isLossHealthy ? 'An toàn (≤65%)' : isLossModerate ? 'Trung bình' : 'Báo động (>85%)'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span
                className={`text-3xl font-black tracking-tight ${
                  isLossHealthy ? 'text-emerald-600' : isLossModerate ? 'text-amber-600' : 'text-rose-600'
                }`}
              >
                {fin.loss_ratio}%
              </span>
              <span className="text-xs text-gray-400 font-medium">Bồi thường / Phí thu</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#d0d5dd]/50 flex items-center justify-between text-xs text-[#4a5568]">
            <span>Chi bồi thường:</span>
            <span className="font-bold text-[#13426f]">{fmtVNDCompact(fin.total_approved_amount)}</span>
          </div>
        </div>

        {/* Total Paid Premium (GWP) */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Doanh Thu Phí Đã Thu (GWP)
              </span>
              <div className="w-7 h-7 rounded-full bg-[#eef6ff] text-[#2e96ff] flex items-center justify-center font-bold border border-[#2e96ff]/20">
                <DollarSign size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-[#13426f] tracking-tight">
                {fmtVNDCompact(fin.total_paid_premium)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#d0d5dd]/50 flex items-center justify-between text-xs text-[#4a5568]">
            <span>Khách hàng đang active:</span>
            <span className="font-bold text-[#2e96ff]">{data.users.active} người</span>
          </div>
        </div>

        {/* Outstanding Reserves & Fraud Saved */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Dự Phòng Tổn Thất (Reserves)
              </span>
              <div className="w-7 h-7 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center font-bold border border-purple-200">
                <Wallet size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-purple-700 tracking-tight">
                {fmtVNDCompact(fin.outstanding_reserves)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#d0d5dd]/50 flex items-center justify-between text-xs text-[#4a5568]">
            <span>Gian lận đã chặn:</span>
            <span className="font-bold text-emerald-600">{fmtVNDCompact(fin.fraud_prevented_amount)}</span>
          </div>
        </div>

        {/* STP & Operations Speed */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Tỷ Lệ Duyệt Tức Thì (STP Rate)
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200">
                <Sparkles size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-[#2e96ff] tracking-tight">{fin.stp_rate}%</span>
              <span className="text-xs text-gray-400 font-medium">Auto-approved</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#d0d5dd]/50 flex items-center justify-between text-xs text-[#4a5568]">
            <span>Xử lý bồi thường:</span>
            <span className="font-bold text-[#13426f]">{data.claims.approved} hồ sơ duyệt</span>
          </div>
        </div>
      </div>

      {/* ── ROW 2: QUARTERLY COMPARISON (Q1 - Q4) ───────────────────────────── */}
      {data.quarterly_comparison && data.quarterly_comparison.length > 0 && (
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-[#13426f] text-base">
                Diễn Biến 4 Quý Năm {selectedYear}
              </h3>
              <p className="text-xs text-[#4a5568]">
                So sánh doanh thu phí, chi trả bồi thường và tỷ lệ Loss Ratio theo từng quý
              </p>
            </div>
            <span className="text-xs font-bold text-[#13426f] bg-[#f9f7f0] border border-[#d0d5dd] px-3.5 py-1 rounded-full">
              Q1 → Q4 {selectedYear}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.quarterly_comparison.map((q) => {
              const qLr = q.loss_ratio;
              const qHealthy = qLr <= 65;
              const qModerate = qLr > 65 && qLr <= 85;

              return (
                <div
                  key={q.quarter}
                  className="rounded-2xl border border-[#d0d5dd] p-4 sm:p-5 bg-[#f9f7f0]/50 hover:bg-white hover:border-[#2e96ff] transition-all shadow-xs flex flex-col justify-between overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="font-bold text-sm text-[#13426f]">{q.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        qHealthy
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : qModerate
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      LR: {q.loss_ratio}%
                    </span>
                  </div>

                  <div className="space-y-2 text-xs mt-2">
                    <div className="flex items-center justify-between text-slate-600 gap-2">
                      <span className="text-slate-500">Phí thu:</span>
                      <span className="font-bold text-[#13426f] text-right truncate">{fmtVNDCompact(q.gwp)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 gap-2">
                      <span className="text-slate-500">Chi trả:</span>
                      <span className="font-bold text-rose-600 text-right truncate">{fmtVNDCompact(q.claims_paid)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 pt-2 border-t border-[#d0d5dd]/60 text-[11px] gap-2">
                      <span>Số lượng yêu cầu:</span>
                      <span className="font-semibold text-slate-800 text-right shrink-0">{q.claims_count} claim</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROW 3: TIMELINE CHART & METRIC SWITCHER ─────────────────────────── */}
      <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#d0d5dd]/50">
          <div>
            <h3 className="font-bold text-[#13426f] text-base">
              Biểu Đồ Xu Hướng Hoạt Động & Biến Động Tổn Thất
            </h3>
            <p className="text-xs text-[#4a5568]">
              {period === 'year' && `Chi tiết 12 tháng năm ${selectedYear}`}
              {period === 'quarter' && `Chi tiết các tháng trong Quý ${selectedQuarter}/${selectedYear}`}
              {period === 'month' && `Chi tiết từng ngày trong Tháng ${selectedMonth}/${selectedYear}`}
              {period === 'week' && `Chi tiết 7 ngày trong Tuần ${selectedWeek}/${selectedYear}`}
              {period === 'all' && 'Diễn biến qua các năm gần nhất'}
            </p>
          </div>

          {/* Metric Selector Pills: Relief Pill Container */}
          <div className="flex items-center bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd] text-xs font-bold">
            <button
              onClick={() => setChartMetric('amount')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                chartMetric === 'amount'
                  ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                  : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Số tiền (VNĐ)
            </button>
            <button
              onClick={() => setChartMetric('count')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                chartMetric === 'count'
                  ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                  : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Số lượng claim
            </button>
            <button
              onClick={() => setChartMetric('loss_ratio')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                chartMetric === 'loss_ratio'
                  ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                  : 'text-[#4a5568] hover:text-[#13426f]'
              }`}
            >
              Tỷ lệ Loss Ratio (%)
            </button>
          </div>
        </div>

        {/* Chart Container */}
        {timelinePoints.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-medium">
            Không có dữ liệu trong khoảng thời gian đã chọn.
          </div>
        ) : (
          <BarTimelineChart points={timelinePoints} metric={chartMetric} />
        )}
      </div>

      {/* ── ROW 4: CLAIMS FUNNEL & REGION DISTRIBUTION ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Claims Funnel */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <h3 className="font-bold text-[#13426f] text-base mb-1">
            Phễu Xét Duyệt Hồ Sơ Bồi Thường
          </h3>
          <p className="text-xs text-[#4a5568] mb-4">
            Tổng {data.claims.total} yêu cầu đã tiếp nhận
          </p>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle size={14} /> Đã phê duyệt chi trả
                </span>
                <span className="text-slate-900 font-bold">
                  {data.claims.approved} ({data.claims.approval_rate}%)
                </span>
              </div>
              <div className="w-full bg-[#f9f7f0] rounded-full h-2.5 overflow-hidden border border-[#d0d5dd]/40">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${data.claims.approval_rate}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-amber-700 flex items-center gap-1.5">
                  <Clock size={14} /> Cần xét duyệt thủ công
                </span>
                <span className="text-slate-900 font-bold">{data.claims.manual_review}</span>
              </div>
              <div className="w-full bg-[#f9f7f0] rounded-full h-2.5 overflow-hidden border border-[#d0d5dd]/40">
                <div
                  className="bg-amber-500 h-2.5 rounded-full transition-all"
                  style={{
                    width: `${Math.round((data.claims.manual_review / (data.claims.total || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-rose-700 flex items-center gap-1.5">
                  <XCircle size={14} /> Bị từ chối
                </span>
                <span className="text-slate-900 font-bold">{data.claims.rejected}</span>
              </div>
              <div className="w-full bg-[#f9f7f0] rounded-full h-2.5 overflow-hidden border border-[#d0d5dd]/40">
                <div
                  className="bg-rose-500 h-2.5 rounded-full transition-all"
                  style={{
                    width: `${Math.round((data.claims.rejected / (data.claims.total || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-[#2e96ff] flex items-center gap-1.5">
                  <Loader2 size={14} /> Đang xử lý
                </span>
                <span className="text-slate-900 font-bold">{data.claims.processing}</span>
              </div>
              <div className="w-full bg-[#f9f7f0] rounded-full h-2.5 overflow-hidden border border-[#d0d5dd]/40">
                <div
                  className="bg-[#2e96ff] h-2.5 rounded-full transition-all"
                  style={{
                    width: `${Math.round((data.claims.processing / (data.claims.total || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Region Breakdown */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <h3 className="font-bold text-[#13426f] text-base mb-1">
            Phân Bố Tổn Thất Theo Vùng Miền
          </h3>
          <p className="text-xs text-[#4a5568] mb-4">
            Tỷ lệ sự cố và bồi thường phát sinh theo địa bàn
          </p>

          <div className="space-y-4">
            {[
              { key: 'north', label: 'Miền Bắc', color: 'bg-[#2e96ff]', text: 'text-[#13426f]' },
              { key: 'central', label: 'Miền Trung (Tâm bão)', color: 'bg-amber-500', text: 'text-amber-700' },
              { key: 'south', label: 'Miền Nam', color: 'bg-emerald-600', text: 'text-emerald-700' },
            ].map((reg) => {
              const cnt = data.region_breakdown[reg.key] || 0;
              const pct = Math.round((cnt / totalRegion) * 100);
              return (
                <div key={reg.key}>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className={reg.text}>{reg.label}</span>
                    <span className="text-[#13426f] font-bold">
                      {cnt} hồ sơ ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#f9f7f0] rounded-full h-2.5 overflow-hidden border border-[#d0d5dd]/40">
                    <div
                      className={`${reg.color} h-2.5 rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* High Risk Provinces */}
        <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <h3 className="font-bold text-[#13426f] text-base mb-1">
            Top Tỉnh Thành Rủi Ro Thiên Tai Cao
          </h3>
          <p className="text-xs text-[#4a5568] mb-4">
            Cần tăng biên độ dự phòng bồi thường
          </p>

          <div className="divide-y divide-[#d0d5dd]/50">
            {data.top_high_risk_provinces.slice(0, 5).map((p, idx) => (
              <div key={p.name} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#f9f7f0] border border-[#d0d5dd] text-[#13426f] font-bold flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-bold text-[#13426f]">{p.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize font-medium">{p.region}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-rose-600 text-sm">
                    {p.risk_score}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-1">/ 100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ROW 5: REVIEWER PERFORMANCE TABLE ───────────────────────────────── */}
      <div className="bg-white rounded-[22px] border border-[#d0d5dd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
        <h3 className="font-bold text-[#13426f] text-base mb-1">
          Năng Lực & Hiệu Suất Đội Ngũ Thẩm Định Viên (Reviewer Operations)
        </h3>
        <p className="text-xs text-[#4a5568] mb-4">
          Theo dõi khối lượng hồ sơ đã xử lý và tỷ lệ phê duyệt của từng giám định viên
        </p>

        <div className="overflow-x-auto rounded-[18px] border border-[#d0d5dd] shadow-2xs">
          <table className="w-full text-xs">
            <thead className="bg-[#f9f7f0] text-[#13426f] font-bold uppercase tracking-wider text-[10px] border-b border-[#d0d5dd]">
              <tr>
                <th className="text-left px-4 py-3">Thẩm định viên</th>
                <th className="text-center px-4 py-3">Tổng hồ sơ đã xử lý</th>
                <th className="text-center px-4 py-3">Số lượng duyệt</th>
                <th className="text-center px-4 py-3">Số lượng từ chối</th>
                <th className="text-right px-4 py-3">Tỷ lệ duyệt (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d0d5dd]/50 bg-white">
              {data.reviewer_performance.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-gray-400">
                    Chưa có hoạt động xét duyệt thủ công nào
                  </td>
                </tr>
              ) : (
                data.reviewer_performance.map((r) => (
                  <tr key={r.reviewer_id} className="hover:bg-[#f9f7f0]/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#13426f]">
                      <div>{r.full_name || r.email}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[#13426f]">
                      {r.total_reviewed}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-600">
                      {r.approved}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-rose-600">
                      {r.rejected ?? (r.total_reviewed - r.approved)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-[#2e96ff] bg-[#eef6ff] border border-[#2e96ff]/20 px-2.5 py-0.5 rounded-full">
                        {r.approval_rate}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── BAR TIMELINE CHART HELPER COMPONENT ──────────────────────────────────────

function BarTimelineChart({
  points,
  metric,
}: {
  points: TimelinePoint[];
  metric: 'amount' | 'count' | 'loss_ratio';
}) {
  const maxAmount = Math.max(...points.map((p) => Math.max(p.claimed_amount, p.premium_paid, p.approved_amount)), 1);
  const maxCount = Math.max(...points.map((p) => p.claims_count), 1);
  const maxLR = Math.max(...points.map((p) => p.loss_ratio || 0), 100);

  return (
    <div>
      <div className="flex items-center justify-end gap-5 text-xs font-bold mb-4">
        {metric === 'amount' && (
          <>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" /> Phí thu (GWP)
            </span>
            <span className="flex items-center gap-1.5 text-blue-600">
              <span className="w-3 h-3 rounded-xs bg-blue-500 inline-block" /> Chi bồi thường
            </span>
          </>
        )}
        {metric === 'count' && (
          <>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" /> Tổng hồ sơ nộp
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" /> Đã duyệt chi
            </span>
          </>
        )}
        {metric === 'loss_ratio' && (
          <span className="flex items-center gap-1.5 text-amber-600">
            <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" /> Tỷ lệ bồi thường (%)
          </span>
        )}
      </div>

      <div className="h-56 flex items-end gap-2 pt-6 px-2 overflow-x-auto">
        {points.map((pt, i) => {
          let val1 = 0;
          let val2 = 0;
          let maxVal = 1;
          let h1 = 0;
          let h2 = 0;

          if (metric === 'amount') {
            val1 = pt.premium_paid;
            val2 = pt.approved_amount;
            maxVal = maxAmount;
            h1 = Math.round((val1 / maxVal) * 100);
            h2 = Math.round((val2 / maxVal) * 100);
          } else if (metric === 'count') {
            val1 = pt.claims_count;
            val2 = pt.approved_count;
            maxVal = maxCount;
            h1 = Math.round((val1 / maxVal) * 100);
            h2 = Math.round((val2 / maxVal) * 100);
          } else {
            val1 = pt.loss_ratio || 0;
            maxVal = Math.max(maxLR, 100);
            h1 = Math.round((val1 / maxVal) * 100);
          }

          return (
            <div
              key={i}
              className="flex-1 min-w-[36px] flex flex-col items-center h-full justify-end group relative"
            >
              {/* Tooltip on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 absolute -top-12 bg-[#13426f] text-white text-[10px] rounded-[14px] px-3 py-1.5 pointer-events-none whitespace-nowrap z-20 shadow-xl border border-[#2e96ff]/30">
                <p className="font-bold text-[#2e96ff]">{pt.full_label || pt.label}</p>
                {metric === 'amount' && (
                  <p className="text-white/90">
                    Chi: <span className="text-emerald-400 font-semibold">{fmtVNDCompact(pt.approved_amount)}</span> / Thu: <span className="text-[#2e96ff] font-semibold">{fmtVNDCompact(pt.premium_paid)}</span>
                  </p>
                )}
                {metric === 'count' && (
                  <p className="text-white/90">
                    Duyệt: <span className="text-emerald-400 font-semibold">{pt.approved_count}</span> / Tổng: <span className="font-semibold">{pt.claims_count}</span>
                  </p>
                )}
                {metric === 'loss_ratio' && <p className="text-amber-300 font-bold">Loss Ratio: {pt.loss_ratio}%</p>}
              </div>

              {/* Bars */}
              <div className="w-full flex items-end justify-center gap-1.5 h-full pb-2">
                <div
                  className={`w-full max-w-[16px] rounded-t-md transition-all duration-300 ${
                    metric === 'loss_ratio'
                      ? pt.loss_ratio && pt.loss_ratio > 85
                        ? 'bg-rose-500'
                        : pt.loss_ratio && pt.loss_ratio > 65
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                      : 'bg-[#d0d5dd] group-hover:bg-[#d0d5dd]/80'
                  }`}
                  style={{ height: `${h1}%`, minHeight: val1 > 0 ? '4px' : '0' }}
                />

                {metric !== 'loss_ratio' && (
                  <div
                    className={`w-full max-w-[16px] rounded-t-md transition-all duration-300 ${
                      metric === 'amount'
                        ? 'bg-[#2e96ff] group-hover:bg-[#2e96ff]/80'
                        : 'bg-emerald-500 group-hover:bg-emerald-400'
                    }`}
                    style={{ height: `${h2}%`, minHeight: val2 > 0 ? '4px' : '0' }}
                  />
                )}
              </div>

              <span className="text-[10px] font-bold text-slate-500 mt-2 truncate w-full text-center">
                {pt.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
