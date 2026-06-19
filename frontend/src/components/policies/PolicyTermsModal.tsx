'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Car, Heart, Home, Info, Loader2, Shield, ShieldCheck, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

export type PolicyTypeKey = 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';

const TYPE_ICONS: Record<PolicyTypeKey, typeof Heart> = {
  health: Heart,
  life: ShieldCheck,
  property: Home,
  vehicle: Car,
  disaster: AlertTriangle,
  income: Wallet,
};

const TYPE_COLORS: Record<PolicyTypeKey, string> = {
  health: 'from-rose-500 to-red-600',
  life: 'from-blue-500 to-indigo-600',
  property: 'from-emerald-500 to-green-600',
  vehicle: 'from-amber-500 to-orange-600',
  disaster: 'from-orange-500 to-red-600',
  income: 'from-violet-500 to-purple-600',
};

interface PolicyTermsData {
  category: string;
  title: string;
  version: string;
  content: string;
  coverage_types: string[];
  last_updated: string;
}

interface Props {
  category: PolicyTypeKey;
  onClose: () => void;
  /**
   * z-index của modal. Default 50.
   * Khi mở chồng lên modal khác (ví dụ PolicyDetailModal hoặc InsuranceRegistrationModal),
   * truyền z-[60] để stack đúng thứ tự.
   */
  zIndexClass?: string;
}

export function PolicyTermsModal({ category, onClose, zIndexClass = 'z-50' }: Props) {
  const t = useTranslations('policies');
  const tClaims = useTranslations('claims');
  const [data, setData] = useState<PolicyTermsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api.get<PolicyTermsData>(`/policies/terms/${category}`)
      .then((r) => { if (mounted) setData(r.data); })
      .catch((e) => {
        if (!mounted) return;
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail ?? t('termsLoadError'));
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [category, t]);

  const Icon = TYPE_ICONS[category] ?? Shield;
  const gradient = TYPE_COLORS[category] ?? 'from-gray-500 to-gray-700';

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-black/50 flex items-center justify-center p-4`}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-br ${gradient} p-5 text-white relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <Icon size={22} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/80">
                {tClaims(`claimTypes.${category}` as never)}
              </p>
              <h2 className="text-lg font-bold mt-0.5">
                {data?.title ?? t('viewTerms')}
              </h2>
              {data && (
                <p className="text-[11px] text-white/70 mt-1">
                  v{data.version} · {t('lastUpdated')}: {new Date(data.last_updated).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="inline animate-spin text-blue-600" size={24} />
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
              <Info size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {data && !loading && <MarkdownView content={data.content} />}
        </div>

        <div className="border-t bg-gray-50 px-6 py-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('closeBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple inline markdown renderer cho policy content.
 * Hỗ trợ: # / ## / ### heading, list `-`, **bold**, paragraph.
 * Không dùng lib ngoài. XSS-safe (escape HTML trước khi áp bold).
 */
function MarkdownView({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`l-${key++}`} className="list-disc pl-6 my-2 space-y-1 text-sm text-gray-700">
        {listBuffer.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2));
      continue;
    }
    flushList();
    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={`h-${key++}`} className="font-semibold text-gray-800 mt-4 mb-2 text-sm">
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h3
          key={`h-${key++}`}
          className="font-bold text-gray-900 mt-5 mb-2 text-base flex items-center gap-2 pb-1 border-b border-gray-200"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={`h-${key++}`} className="font-bold text-gray-900 text-lg mt-2 mb-3">
          {line.slice(2)}
        </h2>,
      );
    } else {
      blocks.push(
        <p
          key={`p-${key++}`}
          className="text-sm text-gray-700 leading-relaxed my-2"
          dangerouslySetInnerHTML={{ __html: renderInline(line) }}
        />,
      );
    }
  }
  flushList();

  return <div className="max-w-none">{blocks}</div>;
}

function renderInline(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
