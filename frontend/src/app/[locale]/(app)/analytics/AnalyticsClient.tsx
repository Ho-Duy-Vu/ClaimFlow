'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart3, CheckCircle, Clock, DollarSign,
  Loader2, Map, RefreshCw, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface SummaryData {
  scope: 'all' | 'user';
  total_claims: number;
  approved: number;
  rejected: number;
  manual_review: number;
  processing: number;
  approval_rate: number;
  avg_processing_minutes: number;
  total_approved_amount: number;
}

interface DailyData {
  days: number;
  daily_counts: Array<{ date: string; count: number; approved: number }>;
  region_breakdown: Record<string, number>;
  disaster_types: Array<[string, number]>;
  claim_types: Record<string, number>;
}

function fmtVND(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const REGION_COLORS: Record<string, string> = {
  north: '#3b82f6',
  central: '#f97316',
  south: '#10b981',
  unknown: '#9ca3af',
};

export function AnalyticsClient() {
  const t = useTranslations('analytics');
  const tCommon = useTranslations('common');
  const tClaims = useTranslations('claims');
  const tGeo = useTranslations('geo');

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        api.get<SummaryData>('/analytics/summary'),
        api.get<DailyData>('/analytics/daily', { params: { days: 30 } }),
      ]);
      setSummary(s.data);
      setDaily(d.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }

  if (!summary || !daily) {
    return <div className="text-center text-gray-400 py-12">{tCommon('error')}</div>;
  }

  const maxDaily = Math.max(1, ...daily.daily_counts.map(d => d.count));
  const regionTotal = Object.values(daily.region_breakdown).reduce((a, b) => a + b, 0) || 1;
  const maxDisaster = Math.max(1, ...daily.disaster_types.map(([, n]) => n));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 size={22} className="text-blue-600" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('last30Days')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw size={14} className="mr-2" /> {tCommon('refresh')}
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label={t('totalClaims')}
          value={summary.total_claims}
          sub={`${summary.approved} ${t('approved').toLowerCase()}`}
          icon={CheckCircle}
        />
        <MetricCard
          label={t('approvalRate')}
          value={`${summary.approval_rate}%`}
          accent="green"
          icon={TrendingUp}
        />
        <MetricCard
          label={t('avgProcessing')}
          value={`${summary.avg_processing_minutes}`}
          sub={t('minutesUnit')}
          accent="blue"
          icon={Clock}
        />
        <MetricCard
          label={t('approvedAmount')}
          value={fmtVND(summary.total_approved_amount)}
          accent="green"
          icon={DollarSign}
        />
      </div>

      {/* Daily chart */}
      <Section title={t('dailyChart')} icon={BarChart3}>
        {summary.total_claims === 0 ? (
          <div className="text-center text-gray-400 py-12">{t('noData')}</div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-40">
              {daily.daily_counts.map((d, i) => {
                const totalHeight = (d.count / maxDaily) * 100;
                const approvedHeight = d.count > 0 ? (d.approved / d.count) * totalHeight : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end items-center group relative">
                    <div
                      className="w-full bg-blue-300 rounded-t relative"
                      style={{ height: `${totalHeight}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                      title={`${d.date}: ${d.count} total, ${d.approved} approved`}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-blue-600 rounded-t"
                        style={{ height: `${(approvedHeight / totalHeight) * 100 || 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{daily.daily_counts[0]?.date}</span>
              <span>{daily.daily_counts.at(-1)?.date}</span>
            </div>
            <div className="flex gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-300" /> {t('totalClaims')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-600" /> {t('approved')}
              </span>
            </div>
          </>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Region pie */}
        <Section title={t('regionChart')} icon={Map}>
          {regionTotal === 1 && Object.values(daily.region_breakdown).every(v => v === 0) ? (
            <div className="text-center text-gray-400 py-8 text-sm">{t('noData')}</div>
          ) : (
            <RegionPieChart breakdown={daily.region_breakdown} t={t} />
          )}
        </Section>

        {/* Claim types breakdown */}
        <Section title={t('claimTypeChart')} icon={BarChart3}>
          <div className="space-y-2">
            {Object.entries(daily.claim_types).length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">{t('noData')}</div>
            ) : (
              Object.entries(daily.claim_types).map(([type, count]) => {
                const total = Object.values(daily.claim_types).reduce((a, b) => a + b, 0) || 1;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-sm w-36 truncate">{tClaims(`claimTypes.${type}` as any)}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                    <span className="text-sm w-12 text-right text-gray-600">{count}</span>
                  </div>
                );
              })
            )}
          </div>
        </Section>
      </div>

      {/* Disaster types */}
      <Section title={t('disasterChart')} icon={BarChart3} className="mt-6">
        {daily.disaster_types.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">{t('noData')}</div>
        ) : (
          <div className="space-y-2">
            {daily.disaster_types.map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-sm w-32 truncate">
                  {tGeo(`disasterTypes.${type}` as any) || type}
                </span>
                <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-orange-500"
                    style={{ width: `${(count / maxDisaster) * 100}%` }}
                  />
                </div>
                <span className="text-sm w-12 text-right text-gray-600">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function RegionPieChart({ breakdown, t }: { breakdown: Record<string, number>; t: any }) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  let cumulative = 0;
  const slices = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([region, count]) => {
      const value = count / total;
      const start = cumulative;
      cumulative += value;
      return { region, count, start, end: cumulative };
    });

  const r = 60;
  const cx = 80;
  const cy = 80;

  const arc = (start: number, end: number) => {
    if (end - start >= 0.9999) {
      // Full circle as 2 half arcs
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
    }
    const sx = cx + r * Math.sin(2 * Math.PI * start);
    const sy = cy - r * Math.cos(2 * Math.PI * start);
    const ex = cx + r * Math.sin(2 * Math.PI * end);
    const ey = cy - r * Math.cos(2 * Math.PI * end);
    const large = end - start > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`;
  };

  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {slices.map((s) => (
          <path
            key={s.region}
            d={arc(s.start, s.end)}
            fill={REGION_COLORS[s.region] ?? '#9ca3af'}
            stroke="white"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.region} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: REGION_COLORS[s.region] ?? '#9ca3af' }}
            />
            <span className="capitalize">{t(s.region)}</span>
            <span className="text-gray-500 ml-2">
              {s.count} ({Math.round((s.count / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  accent?: 'green' | 'blue' | 'red';
  icon: typeof Clock;
}) {
  const color = accent === 'green' ? 'text-green-600'
    : accent === 'red' ? 'text-red-600'
    : 'text-blue-600';
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <Icon size={16} className={color} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children, className }: { title: string; icon: typeof BarChart3; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${className ?? ''}`}>
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Icon size={16} className="text-blue-600" /> {title}
      </h3>
      {children}
    </div>
  );
}
