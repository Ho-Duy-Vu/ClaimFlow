'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  GitMerge,
  Loader2,
  Pencil,
  ShieldPlus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BBoxOverlay, type BBoxField } from '@/components/documents/BBoxOverlay';
import { BundleResultPanel } from '@/components/documents/BundleResultPanel';
import { PolicyPurchaseWizard } from '@/components/policies/PolicyPurchaseWizard';
import { OCRProcessing } from '@/components/documents/OCRProcessing';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { DocumentRecord } from '@/types';
import api from '@/lib/api';

const DOC_TYPES = [
  { value: 'cccd', labelKey: 'cccd' },
  { value: 'driver_license', labelKey: 'driverLicense' },
  { value: 'passport', labelKey: 'passport' },
  { value: 'insurance_policy', labelKey: 'insurancePolicy' },
  { value: 'vehicle_registration', labelKey: 'vehicleRegistration' },
  { value: 'other', labelKey: 'other' },
] as const;

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

interface OCRField {
  value: string;
  confidence?: number;
  bounding_box?: [number, number, number, number] | null;
}
interface OCRResult {
  document_id: string;
  processing_status: string;
  structured_data: Record<string, OCRField | string | number>;
  ocr_confidence: number | null;
  needs_manual_review: boolean;
  low_confidence_fields: string[];
}
interface ConflictEntry { values: string[]; source_docs: string[] }
interface MergeResult {
  merged_document_id: string;
  merged_data: Record<string, unknown>;
  conflicts: Record<string, ConflictEntry>;
  source_doc_ids: string[];
}
interface ConsolidatedField { value: string; confidence: number; source_doc_index: number }
interface Inconsistency {
  field: string;
  values_by_doc: { doc_index: number; value: string }[];
  severity: 'low' | 'medium' | 'high';
}
interface BundleDoc { index: number; doc_type: string; fields: Record<string, OCRField> }
interface BundleResult {
  bundle_id: string;
  cached?: boolean;
  documents: BundleDoc[];
  consolidated_profile: Record<string, ConsolidatedField>;
  inconsistencies: Inconsistency[];
  missing_for_insurance: string[];
}
interface QueueItem { key: string; name: string; status: 'uploading' | 'done' | 'error'; error?: string; docId?: string }

function fieldValue(v: OCRField | string | number): string {
  if (typeof v === 'object' && v !== null && 'value' in v) return String(v.value ?? '');
  return String(v ?? '');
}
function fieldConf(v: OCRField | string | number): number | undefined {
  if (typeof v === 'object' && v !== null && 'confidence' in v) return v.confidence;
  return undefined;
}
function fieldBbox(v: OCRField | string | number): [number, number, number, number] | null {
  if (typeof v === 'object' && v !== null && 'bounding_box' in v) {
    const b = (v as OCRField).bounding_box;
    if (Array.isArray(b) && b.length === 4) return b;
  }
  return null;
}
function formatFileSize(kb: number) {
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-500',
    processing: 'bg-blue-100 text-blue-600',
    done: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls[status] ?? cls.pending}`}>
      {status === 'processing' && <Loader2 size={10} className="animate-spin" />}
      {status === 'done' && <CheckCircle size={10} />}
      {status === 'failed' && <AlertTriangle size={10} />}
      {label}
    </span>
  );
}

export function DocumentsClient() {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const toast = useToast();

  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OCRResult | null>(null);
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [docImageUrl, setDocImageUrl] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showInsuranceReg, setShowInsuranceReg] = useState(false);
  const [showBBox, setShowBBox] = useState(true);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [docType, setDocType] = useState('cccd');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);

  // Merge state
  const [mergeIds, setMergeIds] = useState<Set<string>>(new Set());
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [merging, setMerging] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<Record<string, string>>({});
  const [savingConflicts, setSavingConflicts] = useState(false);

  // Bundle holistic OCR state (TASK-032)
  const [bundleResult, setBundleResult] = useState<BundleResult | null>(null);
  const [bundling, setBundling] = useState(false);
  const [bundleError, setBundleError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  const statusLabels: Record<string, string> = {
    pending: t('status.pending'),
    processing: t('status.processing'),
    done: t('status.done'),
    failed: t('status.failed'),
  };

  const stepsByStatus = (status: string) => {
    if (status === 'pending') return [
      { label: t('steps.receive'), status: 'active' as const },
      { label: t('steps.ocr'), status: 'pending' as const },
      { label: t('steps.analyze'), status: 'pending' as const },
    ];
    if (status === 'processing') return [
      { label: t('steps.receive'), status: 'done' as const },
      { label: t('steps.ocr'), status: 'active' as const },
      { label: t('steps.analyze'), status: 'pending' as const },
    ];
    return [
      { label: t('steps.receive'), status: 'done' as const },
      { label: t('steps.ocr'), status: 'done' as const },
      { label: t('steps.analyze'), status: 'done' as const },
    ];
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const loadDocs = useCallback(async () => {
    try {
      const r = await api.get<DocumentRecord[]>('/documents');
      setDocs([...r.data].reverse());   // newest first so new uploads appear on top
    } catch { /* silent */ } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollAttemptsRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > 60) {
        clearInterval(pollRef.current!); pollRef.current = null;
        setOcr(prev => prev ? { ...prev, processing_status: 'failed' } : prev);
        return;
      }
      try {
        const r = await api.get<OCRResult>(`/documents/${id}/ocr`);
        setOcr(r.data);
        if (r.data.processing_status === 'done' || r.data.processing_status === 'failed') {
          clearInterval(pollRef.current!); pollRef.current = null;
          loadDocs();
        }
      } catch { clearInterval(pollRef.current!); pollRef.current = null; }
    }, 3000);
  }, [loadDocs]);

  const selectDoc = useCallback(async (id: string) => {
    if (selectedId === id) return;
    setMergeResult(null);
    setSelectedId(id);
    setOcr(null); setDocImageUrl(null); setEditMode(false); setEditFields({});
    if (pollRef.current) clearInterval(pollRef.current);
    setLoadingOcr(true);
    try {
      const [ocrRes, urlRes] = await Promise.allSettled([
        api.get<OCRResult>(`/documents/${id}/ocr`),
        api.get<{ presigned_url: string }>(`/documents/${id}/download-url`),
      ]);
      if (ocrRes.status === 'fulfilled') {
        setOcr(ocrRes.value.data);
        const s = ocrRes.value.data.processing_status;
        if (s === 'pending' || s === 'processing') startPolling(id);
      }
      if (urlRes.status === 'fulfilled') setDocImageUrl(urlRes.value.data.presigned_url);
    } catch { setOcr(null); } finally { setLoadingOcr(false); }
  }, [selectedId, startPolling]);

  // Multi-file upload
  const doUploadBulk = useCallback(async (files: File[]) => {
    setUploadError('');
    const valid = files.filter(f => ALLOWED_TYPES.includes(f.type) && f.size <= 20 * 1024 * 1024);
    const skipped = files.length - valid.length;
    if (skipped > 0) setUploadError(t('unsupportedType'));
    if (!valid.length) return;

    const batch = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const queue: QueueItem[] = valid.map((f, i) => ({ key: `${batch}-${i}`, name: f.name, status: 'uploading' }));
    // Accumulate — keep earlier uploads visible instead of replacing them
    setUploadQueue(prev => [...prev, ...queue]);
    setUploading(true);

    let lastId: string | null = null;
    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < valid.length; i++) {
      const key = queue[i].key;
      try {
        const form = new FormData();
        form.append('file', valid[i]);
        form.append('doc_type', docType);
        form.append('auto_process', 'false');   // don't OCR on upload — user confirms detection
        const r = await api.post<{ document_id: string }>('/documents/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        lastId = r.data.document_id;
        okCount++;
        setUploadQueue(q => q.map(item => item.key === key ? { ...item, status: 'done', docId: r.data.document_id } : item));
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Upload thất bại';
        failCount++;
        setUploadQueue(q => q.map(item => item.key === key ? { ...item, status: 'error', error: msg } : item));
      }
    }

    await loadDocs();
    if (lastId) selectDoc(lastId);
    setUploading(false);
    if (okCount > 0) toast.success(t('uploadSuccess', { count: okCount }));
    if (failCount > 0) toast.error(t('uploadFailed', { count: failCount }));
    // NOTE: do NOT auto-clear the queue — user removes items via the ✕ button.
  }, [docType, loadDocs, selectDoc, t, toast]);

  // Remove one item from the upload queue; if it was uploaded, delete the doc too.
  const removeQueueItem = useCallback(async (key: string, docId?: string) => {
    setUploadQueue(q => q.filter(item => item.key !== key));
    if (docId) {
      try {
        await api.delete(`/documents/${docId}`);
        if (selectedId === docId) { setSelectedId(null); setOcr(null); setDocImageUrl(null); }
        setMergeIds(prev => { const n = new Set(prev); n.delete(docId); return n; });
        await loadDocs();
      } catch { /* ignore */ }
    }
  }, [loadDocs, selectedId]);

  const deleteDoc = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/documents/${id}`);
      if (selectedId === id) { setSelectedId(null); setOcr(null); setDocImageUrl(null); }
      setMergeIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (pollRef.current) clearInterval(pollRef.current);
      await loadDocs();
      toast.success(t('deleteSuccess'));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('deleteFailed');
      toast.error(msg);
    } finally { setDeletingId(null); }
  }, [selectedId, loadDocs, t, toast]);

  const toggleMergeId = (id: string) => {
    setMergeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doMerge = async () => {
    if (mergeIds.size < 2) return;
    setMerging(true);
    try {
      const r = await api.post<MergeResult>('/documents/merge', { document_ids: Array.from(mergeIds) });
      setMergeResult(r.data);
      const choices: Record<string, string> = {};
      Object.entries(r.data.conflicts).forEach(([k, v]) => { choices[k] = String(v.values[0] ?? ''); });
      setConflictChoices(choices);
      setSelectedId(null);
      await loadDocs();
      const conflictCount = Object.keys(r.data.conflicts).length;
      toast.success(conflictCount > 0
        ? t('mergeSuccessWithConflicts', { count: conflictCount })
        : t('mergeSuccess'));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(msg ?? 'Merge thất bại');
      toast.error(msg ?? t('mergeFailed'));
    } finally { setMerging(false); }
  };

  const doBundleOcr = async () => {
    if (mergeIds.size < 2) return;
    setBundleError('');
    setBundling(true);
    try {
      const r = await api.post<BundleResult>('/documents/bundle-ocr', {
        document_ids: Array.from(mergeIds),
      });
      setBundleResult(r.data);
      setMergeResult(null);
      setSelectedId(null);
      toast.success(t('bundleSuccess', {
        docs: r.data.documents.length,
        inconsistencies: r.data.inconsistencies.length,
      }));
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string; error?: string } } };
      let msg: string;
      if (e.response?.status === 429) {
        msg = t('bundleRateLimited');
      } else {
        msg = e.response?.data?.detail ?? e.response?.data?.error ?? t('bundleFailed');
      }
      setBundleError(msg);
      toast.error(msg);
    } finally {
      setBundling(false);
    }
  };

  const saveMergeConflicts = async () => {
    if (!mergeResult) return;
    setSavingConflicts(true);
    try {
      await api.put(`/documents/${mergeResult.merged_document_id}/fields`, conflictChoices);
      setMergeIds(new Set());
      selectDoc(mergeResult.merged_document_id);
      setMergeResult(null);
    } finally { setSavingConflicts(false); }
  };

  const saveFields = async () => {
    if (!selectedId || !ocr) return;
    setSaving(true);
    try {
      await api.put(`/documents/${selectedId}/fields`, editFields);
      const r = await api.get<OCRResult>(`/documents/${selectedId}/ocr`);
      setOcr(r.data); setEditMode(false);
      toast.success(t('saveFieldsSuccess'));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('saveFieldsFailed');
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const exportDoc = async (fmt: 'json' | 'markdown') => {
    if (!selectedId) return;
    try {
      const r = await api.get<{ content: string }>(`/documents/${selectedId}/export?fmt=${fmt}`);
      const blob = new Blob([r.data.content], { type: fmt === 'json' ? 'application/json' : 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `document.${fmt === 'json' ? 'json' : 'md'}`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  const selectedDoc = docs.find(d => d.document_id === selectedId);
  const isImageDoc = !!selectedDoc && (selectedDoc.file_type === 'jpeg' || selectedDoc.file_type === 'png');
  const dataEntries = ocr?.structured_data
    ? Object.entries(ocr.structured_data).filter(([k]) => k !== 'overall_confidence')
    : [];

  const bboxFields: BBoxField[] = dataEntries.flatMap(([key, raw]) => {
    const bbox = fieldBbox(raw);
    if (!bbox) return [];
    return [{
      key,
      bbox,
      isLowConfidence: ocr?.low_confidence_fields.includes(key) ?? false,
    }];
  });

  const handleBBoxSelect = (key: string) => {
    setHoveredField(key);
    if (!editMode) {
      const init: Record<string, string> = {};
      dataEntries.forEach(([k, v]) => { init[k] = fieldValue(v); });
      setEditFields(init);
      setEditMode(true);
      setTimeout(() => fieldRefs.current[key]?.focus(), 50);
    } else {
      fieldRefs.current[key]?.focus();
    }
  };

  return (
    <>
    <div className="flex gap-4" style={{ minHeight: 560 }}>
      {/* ── Left panel ── */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        {/* Upload zone */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('upload')}</p>

          <div className="mb-3">
            <Label className="text-xs text-gray-600 mb-1 block">{t('docType')}</Label>
            <select
              value={docType} onChange={e => setDocType(e.target.value)}
              className="w-full text-sm border rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOC_TYPES.map(d => (
                <option key={d.value} value={d.value}>{t(d.labelKey as Parameters<typeof t>[0])}</option>
              ))}
            </select>
          </div>

          <div
            className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-5 cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); doUploadBulk(Array.from(e.dataTransfer.files)); }}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin text-blue-500" size={22} /> : <Upload className="text-gray-400" size={22} />}
            <p className="text-xs text-gray-500 text-center px-2">{t('dragDrop')}</p>
            <p className="text-xs text-gray-400">{t('multiHint')} · {t('maxSize')}</p>
          </div>
          <input
            ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden"
            onChange={e => { doUploadBulk(Array.from(e.target.files ?? [])); e.target.value = ''; }}
          />
          {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}

          {/* Upload queue — accumulates; remove an item (and its uploaded doc) with ✕ */}
          {uploadQueue.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-500">{t('uploadedList')} ({uploadQueue.length})</p>
                <button onClick={() => setUploadQueue([])} className="text-xs text-gray-400 hover:text-gray-600">
                  {t('clearList')}
                </button>
              </div>
              <ul className="space-y-1">
                {uploadQueue.map(item => (
                  <li key={item.key} className="flex items-center gap-2 text-xs group">
                    {item.status === 'uploading' && <Loader2 size={11} className="animate-spin text-blue-500 shrink-0" />}
                    {item.status === 'done' && <CheckCircle size={11} className="text-green-500 shrink-0" />}
                    {item.status === 'error' && <AlertTriangle size={11} className="text-red-500 shrink-0" />}
                    <span className="truncate text-gray-600 flex-1">{item.name}</span>
                    {item.status !== 'uploading' && (
                      <button
                        onClick={() => removeQueueItem(item.key, item.docId)}
                        title={item.docId ? tc('delete') : t('removeFromList')}
                        className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Document list */}
        <div className="bg-white rounded-xl shadow-sm border flex-1 overflow-hidden flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('listTitle')} ({docs.length})
            </p>
            {mergeIds.size > 0 && (
              <button onClick={() => setMergeIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
                {t('clearMerge')}
              </button>
            )}
          </div>

          {loadingList ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-gray-400">
              <FileText size={28} className="opacity-30 mb-2" />
              <p className="text-xs">{t('empty')}</p>
            </div>
          ) : (
            <ul className="overflow-y-auto flex-1">
              {docs.map(doc => (
                <li key={doc.document_id} className={`flex items-stretch border-b last:border-b-0 ${selectedId === doc.document_id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  {/* Merge checkbox */}
                  <button
                    className="flex items-center px-2 shrink-0"
                    onClick={e => { e.stopPropagation(); toggleMergeId(doc.document_id); }}
                    title={t('merge')}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      mergeIds.has(doc.document_id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'
                    }`}>
                      {mergeIds.has(doc.document_id) && <CheckCircle size={10} className="text-white" />}
                    </div>
                  </button>
                  {/* Doc info */}
                  <button className="flex-1 text-left px-2 py-2.5 transition-colors min-w-0" onClick={() => selectDoc(doc.document_id)}>
                    <div className="flex items-center gap-1.5">
                      <span className={`shrink-0 w-7 h-5 rounded text-center text-xs font-bold leading-5 ${doc.file_type === 'pdf' ? 'bg-red-100 text-red-500' : 'bg-blue-100 text-blue-500'}`}>
                        {doc.file_type === 'pdf' ? 'PDF' : 'IMG'}
                      </span>
                      <p className="text-xs font-medium text-gray-800 truncate">{doc.file_name}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1 pl-9">
                      <span className="text-xs text-gray-400">{formatFileSize(doc.file_size_kb)}</span>
                      <StatusBadge status={doc.processing_status} label={statusLabels[doc.processing_status] ?? doc.processing_status} />
                    </div>
                  </button>
                  {/* Delete */}
                  <button
                    className="px-2 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                    onClick={() => deleteDoc(doc.document_id)}
                    disabled={deletingId === doc.document_id}
                    title={tc('delete')}
                  >
                    {deletingId === doc.document_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Merge + Bundle OCR buttons */}
          {mergeIds.size >= 2 && (
            <div className="p-3 border-t bg-blue-50 space-y-2">
              <Button
                className="w-full text-xs gap-1.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                size="sm"
                onClick={doBundleOcr} disabled={bundling || merging}
              >
                {bundling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {t('bundleBtn')} ({mergeIds.size})
              </Button>
              <Button
                className="w-full text-xs gap-1.5" size="sm" variant="outline"
                onClick={doMerge} disabled={merging || bundling}
              >
                {merging ? <Loader2 size={13} className="animate-spin" /> : <GitMerge size={13} />}
                {t('mergeBtn')} ({mergeIds.size})
              </Button>
              {bundleError && <p className="text-xs text-red-500">{bundleError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 min-w-0">
        {/* Bundle holistic OCR result panel */}
        {bundleResult ? (
          <ErrorBoundary>
            <BundleResultPanel
              bundle={bundleResult}
              docs={docs}
              onClose={() => { setBundleResult(null); setMergeIds(new Set()); }}
              onCreateForm={() => setShowInsuranceReg(true)}
              labels={{
                title: t('bundleTitle'),
                docsRead: t('bundleDocsRead'),
                inconsistencyCount: t('bundleInconsistencies'),
                missingCount: t('bundleMissingFields'),
                consolidated: t('bundleConsolidated'),
                fromDoc: t('bundleFromDoc'),
                inconsistencies: t('bundleInconsistenciesTitle'),
                missing: t('bundleMissingTitle'),
                noInconsistency: t('bundleNoInconsistency'),
                noMissing: t('bundleNoMissing'),
                severityHigh: t('severityHigh'),
                severityMedium: t('severityMedium'),
                severityLow: t('severityLow'),
                cached: t('bundleCached'),
                fieldCol: t('fieldCol'),
                valueCol: t('valueCol'),
                createForm: t('bundleCreateForm'),
              }}
            />
          </ErrorBoundary>
        ) : mergeResult ? (
          <ErrorBoundary>
            <div className="bg-white rounded-xl shadow-sm border h-full flex flex-col">
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div className="flex items-center gap-2">
                  <GitMerge size={16} className="text-blue-500" />
                  <h2 className="font-semibold text-gray-900 text-sm">{t('mergeResult')}</h2>
                  <span className="text-xs text-gray-400">
                    {t('mergedFrom').replace('{count}', String(mergeResult.source_doc_ids.length))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {Object.keys(mergeResult.conflicts).length > 0 && (
                    <Button size="sm" className="text-xs" onClick={saveMergeConflicts} disabled={savingConflicts}>
                      {savingConflicts && <Loader2 size={12} className="animate-spin mr-1" />}
                      {tc('save')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                    setMergeResult(null); setMergeIds(new Set());
                    selectDoc(mergeResult.merged_document_id);
                  }}>
                    {t('viewMerged')}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => { setMergeResult(null); setMergeIds(new Set()); }}>
                    <X size={12} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Conflicts */}
                {Object.keys(mergeResult.conflicts).length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={14} className="text-orange-500" />
                      <p className="text-sm font-semibold text-orange-700">{t('conflicts')} ({Object.keys(mergeResult.conflicts).length})</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{t('conflictHint')}</p>
                    <div className="space-y-3">
                      {Object.entries(mergeResult.conflicts).map(([key, conflict]) => (
                        <div key={key} className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                          <p className="text-xs font-semibold text-gray-700 capitalize mb-2">{key.replace(/_/g, ' ')}</p>
                          <div className="space-y-1.5">
                            {conflict.values.map((val, idx) => {
                              const srcDoc = docs.find(d => d.document_id === conflict.source_docs[idx]);
                              return (
                                <label key={idx} className="flex items-start gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={key}
                                    value={String(val)}
                                    checked={conflictChoices[key] === String(val)}
                                    onChange={() => setConflictChoices(prev => ({ ...prev, [key]: String(val) }))}
                                    className="mt-0.5 accent-blue-500"
                                  />
                                  <div>
                                    <span className="text-xs text-gray-800 font-medium">{String(val)}</span>
                                    {srcDoc && (
                                      <span className="text-xs text-gray-400 ml-1.5 truncate">({srcDoc.file_name})</span>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-100">
                    <CheckCircle size={14} className="text-green-500" />
                    <p className="text-sm text-green-700">{t('noConflicts')}</p>
                  </div>
                )}

                {/* Merged data table */}
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 uppercase tracking-wide w-1/3">{t('fieldCol')}</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 uppercase tracking-wide">{t('valueCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(mergeResult.merged_data).filter(([k]) => k !== 'overall_confidence').map(([key, val]) => (
                        <tr key={key} className="border-b last:border-b-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-xs font-medium text-gray-600 capitalize">{key.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-800">
                            {conflictChoices[key] !== undefined
                              ? <span className="text-blue-700 font-medium">{conflictChoices[key]}</span>
                              : String(val ?? '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ErrorBoundary>
        ) : !selectedId ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl border shadow-sm">
            <FileText size={36} className="opacity-20 mb-3" />
            <p className="text-sm">{t('selectHint')}</p>
          </div>
        ) : (
          /* OCR detail panel */
          <ErrorBoundary>
            <div className="bg-white rounded-xl shadow-sm border h-full flex flex-col">
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold ${selectedDoc?.file_type === 'pdf' ? 'bg-red-100 text-red-500' : 'bg-blue-100 text-blue-500'}`}>
                    {selectedDoc?.file_type?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-gray-900 text-sm truncate">{selectedDoc?.file_name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedDoc && formatFileSize(selectedDoc.file_size_kb)} · <span className="capitalize">{selectedDoc?.doc_type?.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ocr?.processing_status === 'done' && (
                    <>
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => exportDoc('json')}><Download size={12} /> JSON</Button>
                      <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => exportDoc('markdown')}><Download size={12} /> MD</Button>
                      <Button size="sm" className="text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setShowInsuranceReg(true)}>
                        <ShieldPlus size={12} /> {t('registerInsuranceBtn')}
                      </Button>
                      {!editMode ? (
                        <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
                          const init: Record<string, string> = {};
                          dataEntries.forEach(([k, v]) => { init[k] = fieldValue(v); });
                          setEditFields(init); setEditMode(true);
                        }}><Pencil size={12} /> {tc('edit')}</Button>
                      ) : (
                        <>
                          <Button size="sm" className="text-xs" onClick={saveFields} disabled={saving}>
                            {saving && <Loader2 size={12} className="animate-spin mr-1" />}{tc('save')}
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => setEditMode(false)}><X size={12} /></Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {loadingOcr ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                ) : (
                  <>
                    {isImageDoc && docImageUrl && (
                      <div className="mb-5 rounded-xl border overflow-hidden bg-gray-50">
                        {showBBox && bboxFields.length > 0 ? (
                          <BBoxOverlay
                            imageUrl={docImageUrl}
                            alt={selectedDoc?.file_name ?? ''}
                            fields={bboxFields}
                            hoveredKey={hoveredField}
                            onHover={setHoveredField}
                            onSelect={handleBBoxSelect}
                            onImageError={() => setDocImageUrl(null)}
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={docImageUrl} alt={selectedDoc?.file_name} className="w-full max-h-[480px] object-contain" onError={() => setDocImageUrl(null)} />
                        )}
                        {bboxFields.length > 0 && (
                          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t bg-white text-xs">
                            <span className="text-gray-500">
                              {t('bboxCount').replace('{count}', String(bboxFields.length))}
                            </span>
                            <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={showBBox}
                                onChange={e => setShowBBox(e.target.checked)}
                                className="accent-blue-500"
                              />
                              {t('showBBox')}
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedDoc?.file_type === 'pdf' && (
                      <div className="mb-5 flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
                        <div className="p-2 bg-red-100 rounded-lg shrink-0"><FileText className="text-red-500" size={20} /></div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{selectedDoc.file_name}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(selectedDoc.file_size_kb)} · PDF</p>
                        </div>
                      </div>
                    )}

                    {/* Uploaded but not yet detected — user must confirm to run OCR */}
                    {ocr?.processing_status === 'pending' && (
                      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <FileText className="text-blue-500 mt-0.5" size={16} />
                            <div>
                              <p className="text-sm font-semibold text-blue-800">{t('detectTitle')}</p>
                              <p className="text-xs text-blue-600 mt-0.5">{t('detectHint')}</p>
                            </div>
                          </div>
                          <Button size="sm" className="text-xs shrink-0 gap-1.5"
                            onClick={async () => {
                              if (!selectedId) return;
                              try {
                                await api.post(`/documents/${selectedId}/reprocess`);
                                startPolling(selectedId);
                                const r = await api.get<OCRResult>(`/documents/${selectedId}/ocr`);
                                setOcr(r.data);
                              } catch { /* ignore */ }
                            }}>
                            <Sparkles size={13} /> {t('detectBtn')}
                          </Button>
                        </div>
                      </div>
                    )}

                    {ocr?.processing_status === 'processing' && (
                      <div className="mb-5 rounded-xl border bg-gray-50 p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('processing')}</p>
                        <OCRProcessing steps={stepsByStatus(ocr.processing_status)} />
                      </div>
                    )}

                    {ocr?.processing_status === 'failed' && (
                      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="text-red-500" size={16} />
                            <p className="text-sm font-medium text-red-700">{t('ocrFailed')}</p>
                          </div>
                          <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                            onClick={async () => {
                              if (!selectedId) return;
                              try {
                                await api.post(`/documents/${selectedId}/reprocess`);
                                startPolling(selectedId);
                                const r = await api.get<OCRResult>(`/documents/${selectedId}/ocr`);
                                setOcr(r.data);
                              } catch { /* ignore */ }
                            }}>
                            {t('retry')}
                          </Button>
                        </div>
                        <p className="text-xs text-red-500 mt-1">{t('retryHint')}</p>
                      </div>
                    )}

                    {ocr?.processing_status === 'done' && (
                      <div className="flex items-center gap-3 mb-4">
                        {ocr.ocr_confidence !== null && (
                          <span className="text-xs text-gray-500">{t('confidence')}:{' '}
                            <span className="font-semibold text-gray-800">{Math.round(ocr.ocr_confidence * 100)}%</span>
                          </span>
                        )}
                        {ocr.needs_manual_review && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={10} /> {t('needsReview')}
                          </span>
                        )}
                      </div>
                    )}

                    {ocr?.processing_status === 'done' && dataEntries.length > 0 && (
                      <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 uppercase tracking-wide w-1/3">{t('fieldCol')}</th>
                              <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 uppercase tracking-wide">{t('valueCol')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dataEntries.map(([key, raw]) => {
                              const val = fieldValue(raw);
                              const conf = fieldConf(raw);
                              const isLowConf = ocr.low_confidence_fields.includes(key);
                              const hasBbox = !!fieldBbox(raw);
                              const isHovered = hoveredField === key;
                              return (
                                <tr
                                  key={key}
                                  className={`border-b last:border-b-0 transition-colors ${
                                    isHovered ? 'bg-blue-50' : 'hover:bg-gray-50'
                                  }`}
                                  onMouseEnter={() => hasBbox && setHoveredField(key)}
                                  onMouseLeave={() => hasBbox && setHoveredField(null)}
                                >
                                  <td className="px-4 py-2.5 text-xs font-medium text-gray-600 align-top">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                                      {hasBbox && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title={t('hasBBox')} />
                                      )}
                                      {isLowConf && (
                                        <span className="inline-flex items-center gap-0.5 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-200 whitespace-nowrap">
                                          <AlertTriangle size={9} /> {t('needsReview')}
                                        </span>
                                      )}
                                    </div>
                                    {conf !== undefined && <span className="text-gray-400 text-xs block mt-0.5">{Math.round(conf * 100)}%</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-gray-800">
                                    {editMode ? (
                                      <Input
                                        ref={el => { fieldRefs.current[key] = el; }}
                                        value={editFields[key] ?? val}
                                        onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                                        className="h-7 text-xs"
                                      />
                                    ) : (
                                      <span className={isLowConf ? 'text-orange-700' : ''}>{val}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {ocr?.processing_status === 'done' && dataEntries.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">{t('noData')}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </ErrorBoundary>
        )}
      </div>
    </div>

    {showInsuranceReg && (bundleResult || ocr?.structured_data) && (
      <PolicyPurchaseWizard
        ocrData={bundleResult ? undefined : ocr?.structured_data}
        consolidatedProfile={bundleResult?.consolidated_profile}
        bundleDocuments={bundleResult?.documents}
        missingFields={bundleResult?.missing_for_insurance}
        onClose={() => setShowInsuranceReg(false)}
        onSuccess={() => {
          setShowInsuranceReg(false);
          if (bundleResult) { setBundleResult(null); setMergeIds(new Set()); }
        }}
      />
    )}
    </>
  );
}
