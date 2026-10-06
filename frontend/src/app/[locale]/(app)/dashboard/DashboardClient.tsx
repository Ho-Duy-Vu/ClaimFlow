'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, BarChart3, Bot, CheckCircle, ClipboardList,
  Clock, Compass, FileText, Loader2, Map, MapPin, Plus, Shield, ShieldCheck,
  TrendingUp, Users as UsersIcon, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { detectUserProvince } from '@/lib/location';
import { getPolicySubjectLabel, getRelationshipLabel } from '@/lib/policy-helpers';
import { LiveWeatherBadge, AnimatedRadarBeacon, AnimatedRainIcon, AnimatedWaveIcon } from '@/components/weather/WeatherIcons';
import api from '@/lib/api';
import type { Claim, GeoRisk, User, UserPolicy } from '@/types';

interface DashboardData {
  user: User;
  claims: Claim[];
  policies: UserPolicy[];
  geoRisk: GeoRisk | null;
  reviewerStats?: { pending_in_queue: number };
}

export function DashboardClient() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tClaims = useTranslations('claims');
  const tNav = useTranslations('nav');
  const locale = useLocale();

  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [detectedProvince, setDetectedProvince] = useState<string | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationDismissed, setLocationDismissed] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const me = await api.get<User>('/auth/me');
      const user = me.data;

      const [claimsR, policiesR, geoR, reviewerR] = await Promise.allSettled([
        api.get<Claim[]>('/claims'),
        api.get<UserPolicy[]>('/policies'),
        user.province
          ? api.get<GeoRisk>(`/geo-risk/province/${encodeURIComponent(user.province)}`)
          : Promise.reject(),
        user.role === 'reviewer' || user.role === 'admin'
          ? api.get<{ pending_in_queue: number }>('/reviewer/stats')
          : Promise.reject(),
      ]);

      setData({
        user,
        claims: claimsR.status === 'fulfilled' ? claimsR.value.data : [],
        policies: policiesR.status === 'fulfilled' ? policiesR.value.data : [],
        geoRisk: geoR.status === 'fulfilled' ? geoR.value.data : null,
        reviewerStats: reviewerR.status === 'fulfilled' ? reviewerR.value.data : undefined,
      });

      // Cold-start: if user has no province, attempt smart location detection
      if (!user.province) {
        detectUserProvince().then((p) => {
          if (p) setDetectedProvince(p);
        });
      }
    } catch {
      // not authenticated
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleConfirmLocation = async (prov: string) => {
    setSavingLocation(true);
    try {
      await api.patch('/auth/location', { province: prov });
      toast.success(`Đã cập nhật khu vực: ${prov}`);
      await loadDashboard();
    } catch {
      toast.error('Không thể cập nhật khu vực');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleManualDetect = async () => {
    setDetecting(true);
    try {
      const p = await detectUserProvince();
      if (p) {
        setDetectedProvince(p);
      }
    } catch {
      toast.error('Không thể nhận diện vị trí');
    } finally {
      setDetecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-[#2e96ff]" size={32} />
      </div>
    );
  }

  if (!data) return null;

  const { user, claims, policies, geoRisk, reviewerStats } = data;
  const role = user.role ?? 'user';

  const activeClaims = claims.filter(
    (c) => !['approved', 'rejected'].includes(c.status)
  );
  const activePolicies = policies.filter((p) => p.status === 'active');
  const recentClaims = [...claims]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const displayName = user.full_name?.split(' ').pop() ?? user.email.split('@')[0];

  const subtitleKey =
    role === 'admin' ? 'subtitleAdmin'
    : role === 'reviewer' ? 'subtitleReviewer'
    : 'subtitleUser';

  return (
    <div className="space-y-6">
      {/* Welcome banner — Deep Harbor Nautical Anchor with Live Weather Widget */}
      <div className="bg-[#13426f] rounded-[24px] p-6 sm:p-7 text-white shadow-[0_6px_0_rgba(0,0,0,0.08)] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t('welcomeBack', { name: displayName })}</h1>
          <p className="text-[#bde1f9] text-sm mt-1 font-medium">{t(subtitleKey)}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3.5">
          <LiveWeatherBadge
            province={data?.geoRisk?.province_name ?? user.province}
            score={data?.geoRisk?.overall_risk_score}
            disasterType={data?.geoRisk?.disaster_risks?.[0]?.type}
          />
          <Link
            href={`/${locale}/claims`}
            className="self-start sm:self-auto inline-flex items-center gap-2 bg-[#2e96ff] hover:bg-[#2585e5] text-white font-bold text-sm px-6 py-3 rounded-full shadow-[0_6px_0_0_rgba(154,207,246,0.5)] active:translate-y-1 active:shadow-[0_2px_0_0_rgba(154,207,246,0.5)] transition-all shrink-0 cursor-pointer"
          >
            <Plus size={16} className="stroke-[2.5]" />
            <span>Tạo yêu cầu bồi thường</span>
          </Link>
        </div>
      </div>

      {/* Smart Location Detection (Cold-Start resolution) */}
      {!user.province && !locationDismissed && (
        <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#bde1f9] text-[#13426f] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 relative">
              {detecting ? (
                <Compass size={22} className="stroke-[2.5] animate-spin-medium text-[#2e96ff]" />
              ) : (
                <>
                  <MapPin size={20} className="stroke-[2.5]" />
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#2e96ff] animate-ping" />
                </>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[#13426f]">
                  {detecting
                    ? 'Đang nhận diện vị trí của bạn...'
                    : detectedProvince
                    ? `Hệ thống nhận thấy bạn đang ở ${detectedProvince}`
                    : 'Kích hoạt định vị rủi ro thông minh'}
                </h3>
                <span className="text-[11px] bg-[#bde1f9] text-[#13426f] font-bold px-2.5 py-0.5 rounded-full">
                  Smart Location
                </span>
              </div>
              <p className="text-xs text-[#616c8a] mt-1 max-w-xl">
                {detectedProvince
                  ? `Xác nhận để ClaimFlow tự động nạp điểm rủi ro thiên tai và khuyến nghị gói bảo hiểm phù hợp nhất cho khu vực ${detectedProvince}.`
                  : 'Cho phép định vị hoặc chọn tỉnh thành để xem ngay cảnh báo rủi ro thiên tai và điểm rủi ro địa phương.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
            {detectedProvince ? (
              <>
                <Button
                  size="sm"
                  onClick={() => handleConfirmLocation(detectedProvince)}
                  disabled={savingLocation}
                  className="text-xs h-9 bg-[#2e96ff] hover:bg-[#2585e5] text-white font-bold rounded-full gap-1.5 shadow-[0_5px_0_0_rgba(154,207,246,0.5)]"
                >
                  {savingLocation ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  Xác nhận ({detectedProvince})
                </Button>
                <button
                  type="button"
                  onClick={() => setLocationDismissed(true)}
                  className="text-xs font-semibold text-[#616c8a] hover:text-[#13426f] px-3 py-1.5 rounded-full"
                >
                  Để sau
                </button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleManualDetect}
                  disabled={detecting}
                  className="text-xs h-9 bg-white border border-[#d0d5dd] hover:bg-[#f9f7f0] text-[#13426f] font-semibold rounded-full gap-1.5"
                >
                  {detecting ? <Loader2 size={13} className="animate-spin" /> : <Compass size={14} />}
                  Định vị vị trí của tôi
                </Button>
                <Link
                  href={`/${locale}/risk-map`}
                  className="text-xs font-semibold text-[#2e96ff] hover:underline px-3 py-1.5"
                >
                  Chọn trên bản đồ →
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* High-risk area alert with Live Radar Beacon */}
      {geoRisk && geoRisk.is_high_risk && (
        <div className="bg-[#fffbeb] border-l-4 border-amber-500 rounded-[20px] p-4 flex items-center justify-between gap-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <AnimatedRadarBeacon color="amber" size={22} />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5 flex-wrap">
                <span>⚠️ {t('highRiskAlert', { province: geoRisk.province_name })}</span>
                <span className="text-xs bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full font-extrabold">
                  {geoRisk.overall_risk_score}/100
                </span>
              </p>
            </div>
          </div>
          <Link
            href={`/${locale}/policies`}
            className="text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 px-3.5 py-1.5 rounded-full transition-colors shrink-0"
          >
            {tClaims('buyPolicy')} →
          </Link>
        </div>
      )}

      {/* Snapshot stats — different from analytics page (focus on personal/role state) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SnapshotCard
          icon={ClipboardList}
          label={t('activeClaims')}
          value={activeClaims.length}
          accent="blue"
          href={`/${locale}/claims`}
        />
        <SnapshotCard
          icon={Shield}
          label={t('activePolicies')}
          value={activePolicies.length}
          accent="green"
          href={`/${locale}/policies`}
        />
        {role === 'user' && (
          <SnapshotCard
            icon={Map}
            label={t('areaRiskScore')}
            value={geoRisk?.overall_risk_score ?? '—'}
            sub={geoRisk?.province_name ?? t('noProvinceSet')}
            accent={geoRisk && geoRisk.overall_risk_score >= 70 ? 'red' : 'gray'}
            href={`/${locale}/risk-map`}
          />
        )}
        {(role === 'reviewer' || role === 'admin') && reviewerStats && (
          <SnapshotCard
            icon={ShieldCheck}
            label={t('pendingReview')}
            value={reviewerStats.pending_in_queue}
            accent="orange"
            href={`/${locale}/reviewer`}
          />
        )}
        <SnapshotCard
          icon={BarChart3}
          label={t('deepDive')}
          value=""
          sub={tNav('analytics')}
          accent="indigo"
          href={`/${locale}/analytics`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent claims (2/3 width) */}
        <div className="lg:col-span-2 bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-[#13426f] text-base flex items-center gap-2">
              <ClipboardList size={18} className="text-[#2e96ff] stroke-[2.5]" />
              {t('recentClaims')}
            </h2>
            <Link
              href={`/${locale}/claims`}
              className="text-xs font-semibold text-[#2e96ff] hover:underline"
            >
              {t('viewAllClaims')} →
            </Link>
          </div>

          {recentClaims.length === 0 ? (
            <EmptyState message={t('noClaimsHint')} />
          ) : (
            <ul className="divide-y">
              {recentClaims.map((c) => {
                const policy = policies.find(p => p.id === c.policy_id);
                return (
                  <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">
                          {tClaims(`claimTypes.${c.claim_type}` as any)}
                        </p>
                        {policy && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {getPolicySubjectLabel(policy)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmtVND(c.amount_claimed)} · {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge
                      status={c.status}
                      label={tClaims(`status.${statusKey(c.status)}` as any)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Quick actions (1/3 width) */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" />
            {t('quickActions')}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <ActionTile
              icon={Plus}
              label={t('actionSubmitClaim')}
              href={`/${locale}/claims`}
              accent="blue"
            />
            <ActionTile
              icon={FileText}
              label={t('actionUploadDoc')}
              href={`/${locale}/documents`}
              accent="violet"
            />
            <ActionTile
              icon={Shield}
              label={t('actionBuyPolicy')}
              href={`/${locale}/policies`}
              accent="green"
            />
            <ActionTile
              icon={Bot}
              label={t('actionChatbot')}
              href={`/${locale}/chatbot`}
              accent="indigo"
            />
            <ActionTile
              icon={Map}
              label={t('actionRiskMap')}
              href={`/${locale}/risk-map`}
              accent="orange"
            />
            {(role === 'reviewer' || role === 'admin') && (
              <ActionTile
                icon={ShieldCheck}
                label={t('actionReviewQueue')}
                href={`/${locale}/reviewer`}
                accent="amber"
              />
            )}
            {role === 'admin' && (
              <ActionTile
                icon={UsersIcon}
                label={t('actionAdminUsers')}
                href={`/${locale}/admin`}
                accent="rose"
              />
            )}
          </div>
        </div>
      </div>

      {/* My policies */}
      <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-[#13426f] text-base flex items-center gap-2">
            <Shield size={18} className="text-[#2e96ff] stroke-[2.5]" />
            {t('myPolicies')}
          </h2>
          <Link
            href={`/${locale}/policies`}
            className="text-xs font-semibold text-[#2e96ff] hover:underline"
          >
            {t('viewAllPolicies')} →
          </Link>
        </div>

        {activePolicies.length === 0 ? (
          <EmptyState message={t('noPoliciesHint')} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {activePolicies.slice(0, 6).map((p) => (
              <div key={p.id} className="border border-[#d0d5dd] rounded-[18px] p-4 bg-[#f9f7f0]/40 hover:bg-[#f9f7f0] hover:border-[#2e96ff] transition-all">
                <div className="flex justify-between items-start mb-1.5">
                  <span className="text-xs font-mono font-medium text-[#616c8a]">{p.policy_number}</span>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                    {tClaims('policyActive')}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#13426f] truncate">
                  {p.plan_name}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <p className="text-xs text-gray-500">
                    {tClaims(`claimTypes.${p.policy_type}` as any)}
                  </p>
                  {p.insured_person?.name && (
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      👤 Cho: {p.insured_person.name} ({getRelationshipLabel(p.insured_person.relationship)})
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-xs text-[#616c8a] mt-2 pt-2 border-t border-[#d0d5dd]/60 font-medium">
                  <span>{t('premiumYearly')}: {fmtVND(p.annual_premium)}</span>
                  <span>{t('expiresOn')}: {new Date(p.end_date).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SnapshotCard({
  icon: Icon, label, value, sub, accent, href,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  sub?: string;
  accent: 'blue' | 'green' | 'orange' | 'red' | 'gray' | 'indigo';
  href: string;
}) {
  const colorMap: Record<typeof accent, string> = {
    blue: 'text-[#2e96ff] bg-[#bde1f9]/40',
    green: 'text-emerald-600 bg-emerald-50',
    orange: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    gray: 'text-[#616c8a] bg-[#f9f7f0]',
    indigo: 'text-[#13426f] bg-[#cde7fb]/60',
  };
  return (
    <Link
      href={href}
      className="bg-white border border-[#d0d5dd] rounded-[22px] p-5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_0_0_rgba(154,207,246,0.4)] hover:border-[#2e96ff] transition-all block"
    >
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-[#616c8a] font-bold uppercase tracking-wider">{label}</p>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorMap[accent]}`}>
          <Icon size={16} className="stroke-[2.5]" />
        </div>
      </div>
      {value !== '' && (
        <p className="text-2xl font-bold text-[#13426f] tracking-tight">{value}</p>
      )}
      {sub && <p className="text-xs text-[#616c8a] mt-1 truncate font-medium">{sub}</p>}
    </Link>
  );
}

function ActionTile({
  icon: Icon, label, href, accent,
}: {
  icon: typeof Plus;
  label: string;
  href: string;
  accent: 'blue' | 'violet' | 'green' | 'indigo' | 'orange' | 'amber' | 'rose';
}) {
  const colorMap: Record<typeof accent, string> = {
    blue: 'text-[#2e96ff] bg-[#bde1f9]/30 hover:bg-[#bde1f9]/50',
    violet: 'text-purple-600 bg-purple-50 hover:bg-purple-100',
    green: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100',
    indigo: 'text-[#13426f] bg-[#cde7fb]/40 hover:bg-[#cde7fb]/60',
    orange: 'text-orange-600 bg-orange-50 hover:bg-orange-100',
    amber: 'text-amber-600 bg-amber-50 hover:bg-amber-100',
    rose: 'text-rose-600 bg-rose-50 hover:bg-rose-100',
  };
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-[18px] border border-[#d0d5dd] bg-white hover:border-[#2e96ff] hover:shadow-[0_4px_0_0_rgba(154,207,246,0.4)] transition-all text-center ${colorMap[accent]}`}
    >
      <Icon size={20} className="stroke-[2.5]" />
      <span className="text-xs font-semibold text-[#13426f] leading-tight">{label}</span>
    </Link>
  );
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
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${cls[status] ?? cls.pending}`}>
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-6 text-sm text-gray-400">{message}</div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
}

function statusKey(status: string) {
  if (status === 'manual_review') return 'manualReview';
  if (status === 'info_requested') return 'infoRequested';
  return status;
}
