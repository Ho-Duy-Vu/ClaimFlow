'use client';

import { AlertTriangle, CheckCircle, Database, ShieldPlus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DocumentRecord } from '@/types';

export interface ConsolidatedField {
  value: string;
  confidence: number;
  source_doc_index: number;
}
export interface Inconsistency {
  field: string;
  values_by_doc: { doc_index: number; value: string }[];
  severity: 'low' | 'medium' | 'high';
}
export interface BundleDoc {
  index: number;
  doc_type: string;
  fields: Record<string, unknown>;
}
export interface BundleResult {
  bundle_id: string;
  cached?: boolean;
  documents: BundleDoc[];
  consolidated_profile: Record<string, ConsolidatedField>;
  inconsistencies: Inconsistency[];
  missing_for_insurance: string[];
}

interface Labels {
  title: string;
  docsRead: string;
  inconsistencyCount: string;
  missingCount: string;
  consolidated: string;
  fromDoc: string;
  inconsistencies: string;
  missing: string;
  noInconsistency: string;
  noMissing: string;
  severityHigh: string;
  severityMedium: string;
  severityLow: string;
  cached: string;
  fieldCol: string;
  valueCol: string;
  createForm: string;
}

interface Props {
  bundle: BundleResult;
  docs: DocumentRecord[];
  onClose: () => void;
  onCreateForm: () => void;
  labels: Labels;
}

const severityClass: Record<Inconsistency['severity'], string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-orange-100 text-orange-700 border-orange-200',
  low: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export function BundleResultPanel({ bundle, docs, onClose, onCreateForm, labels }: Props) {
  const docNameByIndex = (idx: number): string => {
    const docId = bundle.documents[idx]?.fields ? null : null;
    void docId;
    const docFromBundle = bundle.documents[idx];
    if (!docFromBundle) return `#${idx + 1}`;
    // Try to map via order: bundle index N == position N in the original document_ids array
    // We don't have the order locally — fall back to doc_type label
    return docFromBundle.doc_type.replace(/_/g, ' ');
  };

  const profileEntries = Object.entries(bundle.consolidated_profile);

  const severityLabel = (s: Inconsistency['severity']) => (
    s === 'high' ? labels.severityHigh
    : s === 'medium' ? labels.severityMedium
    : labels.severityLow
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-r from-purple-50 via-pink-50 to-white">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={16} className="text-purple-500 shrink-0" />
          <h2 className="font-semibold text-gray-900 text-sm truncate">{labels.title}</h2>
          {bundle.cached && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              <Database size={10} /> {labels.cached}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-green-600 hover:bg-green-700"
            onClick={onCreateForm}
          >
            <ShieldPlus size={12} /> {labels.createForm}
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            <X size={12} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs text-gray-500">{labels.docsRead}</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{bundle.documents.length}</p>
          </div>
          <div className={`rounded-xl border p-3 ${
            bundle.inconsistencies.length > 0 ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'
          }`}>
            <p className="text-xs text-gray-500">{labels.inconsistencyCount}</p>
            <p className={`text-2xl font-bold mt-1 ${
              bundle.inconsistencies.length > 0 ? 'text-orange-600' : 'text-green-600'
            }`}>{bundle.inconsistencies.length}</p>
          </div>
          <div className={`rounded-xl border p-3 ${
            bundle.missing_for_insurance.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'
          }`}>
            <p className="text-xs text-gray-500">{labels.missingCount}</p>
            <p className={`text-2xl font-bold mt-1 ${
              bundle.missing_for_insurance.length > 0 ? 'text-amber-600' : 'text-green-600'
            }`}>{bundle.missing_for_insurance.length}</p>
          </div>
        </div>

        {/* Inconsistencies */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-orange-500" />
            <p className="text-sm font-semibold text-gray-800">{labels.inconsistencies}</p>
          </div>
          {bundle.inconsistencies.length === 0 ? (
            <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-100">
              <CheckCircle size={13} className="text-green-500" />
              <p className="text-xs text-green-700">{labels.noInconsistency}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bundle.inconsistencies.map((inc, i) => (
                <div key={i} className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-gray-700 capitalize">
                      {inc.field.replace(/_/g, ' ')}
                    </span>
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${severityClass[inc.severity]}`}>
                      {severityLabel(inc.severity)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {inc.values_by_doc.map((v, j) => (
                      <li key={j} className="text-xs text-gray-700 flex items-baseline gap-2">
                        <span className="text-gray-400 shrink-0">[{labels.fromDoc} #{v.doc_index + 1}]</span>
                        <span className="font-medium">{v.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missing fields */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <p className="text-sm font-semibold text-gray-800">{labels.missing}</p>
          </div>
          {bundle.missing_for_insurance.length === 0 ? (
            <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-100">
              <CheckCircle size={13} className="text-green-500" />
              <p className="text-xs text-green-700">{labels.noMissing}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {bundle.missing_for_insurance.map(field => (
                <span key={field} className="inline-flex items-center text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full capitalize">
                  {field.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Consolidated profile */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-purple-500" />
            <p className="text-sm font-semibold text-gray-800">{labels.consolidated}</p>
          </div>
          {profileEntries.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">—</p>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 uppercase tracking-wide w-1/3">
                      {labels.fieldCol}
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 uppercase tracking-wide">
                      {labels.valueCol}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profileEntries.map(([key, field]) => (
                    <tr key={key} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-600 capitalize align-top">
                        {key.replace(/_/g, ' ')}
                        {typeof field?.confidence === 'number' && (
                          <span className="text-gray-400 text-xs block mt-0.5">
                            {Math.round(field.confidence * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-800">
                        <div>{field?.value ?? '—'}</div>
                        {typeof field?.source_doc_index === 'number' && (
                          <div className="text-xs text-purple-500 mt-0.5">
                            {labels.fromDoc} #{field.source_doc_index + 1} · {docNameByIndex(field.source_doc_index)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hint that source docs are visible via bundle reference (placeholder for TASK-033) */}
        {docs.length > 0 && <div className="h-0" />}
      </div>
    </div>
  );
}
