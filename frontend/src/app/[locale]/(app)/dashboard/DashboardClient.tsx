'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, BarChart3, Bot, CheckCircle, ClipboardList,
  Clock, FileText, Loader2, Map, Plus, Shield, ShieldCheck,
  TrendingUp, Users as UsersIcon, X,
} from 'lucide-react';
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

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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

        if (cancelled) return;
        setData({
          user,
          claims: claimsR.status === 'fulfilled' ? claimsR.value.data : [],
          policies: policiesR.status === 'fulfilled' ? policiesR.value.data : [],
          geoRisk: geoR.status === 'fulfilled' ? geoR.value.data : null,
          reviewerStats: reviewerR.status === 'fulfilled' ? reviewerR.value.data : undefined,
        });
      } catch {
        // not authenticated → axios interceptor already redirects
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-gray-400 py-12">{tCommon('error')}</div>;
  }

  const { user, claims, policies, geoRisk, reviewerStats } = data;
  const role = user.role;

  const activeClaims = claims.filter(
    (c) => c.status === 'pending' || c.status === 'processing' || c.status === 'manual_review'
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
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">{t('welcomeBack', { name: displayName })}</h1>
        <p className="text-blue-100 text-sm mt-1">{t(subtitleKey)}</p>
      </div>

      {/* High-risk area alert */}
      {geoRisk && geoRisk.is_high_risk && (
        <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-orange-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-orange-900">
              {t('highRiskAlert', { province: geoRisk.province_name })}
            </p>
          </div>
          <Link
            href={`/${locale}/policies`}
            className="text-sm font-medium text-orange-700 hover:text-orange-900 shrink-0"
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
        <div className="lg:col-span-2 bg-white border rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <ClipboardList size={16} className="text-blue-600" />
              {t('recentClaims')}
            </h2>
            <Link
              href={`/${locale}/claims`}
              className="text-xs text-blue-600 hover:underline"
            >
              {t('viewAllClaims')}
            </Link>
          </div>

          {recentClaims.length === 0 ? (
            <EmptyState message={t('noClaimsHint')} />
          ) : (
            <ul className="divide-y">
              {recentClaims.map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {tClaims(`claimTypes.${c.claim_type}` as any)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmtVND(c.amount_claimed)} · {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge
                    status={c.status}
                    label={tClaims(`status.${statusKey(c.status)}` as any)}
                  />
                </li>
              ))}
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
      <div className="bg-white border rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Shield size={16} className="text-green-600" />
            {t('myPolicies')}
          </h2>
          <Link
            href={`/${locale}/policies`}
            className="text-xs text-blue-600 hover:underline"
          >
            {t('viewAllPolicies')}
          </Link>
        </div>

        {activePolicies.length === 0 ? (
          <EmptyState message={t('noPoliciesHint')} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePolicies.slice(0, 6).map((p) => (
              <div key={p.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-mono text-gray-500">{p.policy_number}</span>
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                    {tClaims('policyActive')}
                  </span>
                </div>
                <p className="font-medium text-sm">{p.plan_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tClaims(`claimTypes.${p.policy_type}` as any)}
                </p>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
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
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-orange-600 bg-orange-50',
    red: 'text-red-600 bg-red-50',
    gray: 'text-gray-600 bg-gray-100',
    indigo: 'text-indigo-600 bg-indigo-50',
  };
  return (
    <Link
      href={href}
      className="bg-white border rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all block"
    >
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[accent]}`}>
          <Icon size={14} />
        </div>
      </div>
      {value !== '' && (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
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
    blue: 'text-blue-600 bg-blue-50 hover:bg-blue-100',
    violet: 'text-violet-600 bg-violet-50 hover:bg-violet-100',
    green: 'text-green-600 bg-green-50 hover:bg-green-100',
    indigo: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100',
    orange: 'text-orange-600 bg-orange-50 hover:bg-orange-100',
    amber: 'text-amber-600 bg-amber-50 hover:bg-amber-100',
    rose: 'text-rose-600 bg-rose-50 hover:bg-rose-100',
  };
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg transition-colors text-center ${colorMap[accent]}`}
    >
      <Icon size={20} />
      <span className="text-xs font-medium leading-tight">{label}</span>
    </Link>
  );
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
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls[status] ?? cls.pending}`}>
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
