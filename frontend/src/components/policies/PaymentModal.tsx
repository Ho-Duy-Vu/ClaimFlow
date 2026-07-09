'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Banknote, Check, Copy, CreditCard, Loader2, QrCode, ShieldCheck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PaymentMethod = 'bank_transfer' | 'cash' | 'card';
type PaymentFreq = 'monthly' | 'quarterly' | 'yearly';

interface Props {
  method: PaymentMethod;
  frequency: PaymentFreq;
  amountDue: number;      // first installment to pay now
  annualPremium: number;
  reference: string;      // transfer note / order reference
  payerName: string;
  submitting: boolean;    // purchase request in-flight (parent)
  onCancel: () => void;
  onConfirm: () => void;  // "I've paid" → parent creates the policy
}

// Simulated beneficiary bank account (LOCAL DEMO — not a real account).
const DEMO_BANK = { name: 'Vietcombank', account: '0123456789', holder: 'CONG TY BAO HIEM CLAIMFLOW' };

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

// ── Deterministic pseudo-QR (no external dependency) ────────────────────────────
// Looks like a QR (3 finder patterns + pseudo-random modules seeded from the payload)
// but is intentionally NOT a scannable code — this is a local simulation only.
function seededModules(seed: string, size: number): boolean[][] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const grid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const inFinder = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!inFinder(r, c)) grid[r][c] = rand() > 0.55;
  return grid;
}

function PseudoQR({ seed }: { seed: string }) {
  const size = 25;
  const modules = useMemo(() => seededModules(seed, size), [seed]);
  const cell = 8;
  const dim = size * cell;
  const finderPatterns = [[0, 0], [0, size - 7], [size - 7, 0]];
  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label="Simulated QR code"
      className="rounded-lg bg-white">
      <rect width={dim} height={dim} fill="#ffffff" />
      {modules.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#0f172a" /> : null
        )
      )}
      {finderPatterns.map(([fr, fc], i) => (
        <g key={i}>
          <rect x={fc * cell} y={fr * cell} width={cell * 7} height={cell * 7} fill="#0f172a" />
          <rect x={(fc + 1) * cell} y={(fr + 1) * cell} width={cell * 5} height={cell * 5} fill="#ffffff" />
          <rect x={(fc + 2) * cell} y={(fr + 2) * cell} width={cell * 3} height={cell * 3} fill="#0f172a" />
        </g>
      ))}
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────────
export function PaymentModal({
  method, frequency, amountDue, annualPremium, reference, payerName, submitting, onCancel, onConfirm,
}: Props) {
  const tw = useTranslations('policyWizard');
  const [copied, setCopied] = useState<string>('');
  // Mock card fields (simulated — never sent anywhere)
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', holder: payerName ?? '' });

  const qrSeed = `BANK:${DEMO_BANK.account}|AMT:${amountDue}|REF:${reference}`;

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard blocked — ignore */ }
  };

  const cardValid =
    card.number.replace(/\s/g, '').length >= 12 && /^\d{2}\/\d{2}$/.test(card.expiry) && card.cvv.length >= 3;
  const confirmDisabled = submitting || (method === 'card' && !cardValid);

  const freqLabel = frequency === 'yearly' ? tw('yearly') : frequency === 'quarterly' ? tw('quarterly') : tw('monthly');

  const CopyBtn = ({ value, k }: { value: string; k: string }) => (
    <button type="button" onClick={() => copy(value, k)} className="text-blue-600 hover:text-blue-800 shrink-0" title={tw('copy')}>
      {copied === k ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-gradient-to-r from-emerald-600 to-teal-600 rounded-t-2xl">
          <div className="flex items-center gap-2 text-white">
            {method === 'bank_transfer' ? <QrCode size={17} /> : method === 'card' ? <CreditCard size={17} /> : <Banknote size={17} />}
            <h2 className="font-bold text-sm">{tw('paymentSimTitle')}</h2>
          </div>
          <button onClick={onCancel} disabled={submitting}><X size={17} className="text-emerald-100 hover:text-white" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Simulation banner */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700 text-center">
            {tw('simulatedNote')}
          </div>

          {/* Amount */}
          <div className="text-center">
            <p className="text-xs text-gray-500">{tw('amountDue')} · {freqLabel}</p>
            <p className="text-2xl font-bold text-emerald-700">{fmtVND(amountDue)}</p>
            {frequency !== 'yearly' && (
              <p className="text-[11px] text-gray-400">{tw('annualTotal')}: {fmtVND(annualPremium)}/{tw('years')}</p>
            )}
          </div>

          {/* ── BANK TRANSFER: QR + account details ── */}
          {method === 'bank_transfer' && (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="p-2.5 rounded-xl border-2 border-emerald-100 bg-white">
                  <PseudoQR seed={qrSeed} />
                </div>
                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                  <QrCode size={11} /> {tw('scanToPay')}
                </p>
              </div>

              <div className="rounded-xl border bg-gray-50 divide-y text-sm">
                <Row label={tw('bankName')} value={DEMO_BANK.name} />
                <Row label={tw('accountNumber')} value={DEMO_BANK.account} action={<CopyBtn value={DEMO_BANK.account} k="acc" />} mono />
                <Row label={tw('accountHolder')} value={DEMO_BANK.holder} mono />
                <Row label={tw('transferContent')} value={reference} action={<CopyBtn value={reference} k="ref" />} mono highlight />
                <Row label={tw('amountDue')} value={fmtVND(amountDue)} action={<CopyBtn value={String(amountDue)} k="amt" />} />
              </div>
            </>
          )}

          {/* ── CARD: simulated card form ── */}
          {method === 'card' && (
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">{tw('cardNumber')}</Label>
                <Input inputMode="numeric" placeholder="4111 1111 1111 1111" value={card.number}
                  onChange={e => setCard(p => ({ ...p, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 19) }))}
                  className="text-sm h-9 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('cardExpiry')}</Label>
                  <Input placeholder="MM/YY" value={card.expiry}
                    onChange={e => setCard(p => ({ ...p, expiry: e.target.value.replace(/[^\d/]/g, '').slice(0, 5) }))}
                    className="text-sm h-9 font-mono" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">{tw('cardCvv')}</Label>
                  <Input inputMode="numeric" placeholder="123" value={card.cvv}
                    onChange={e => setCard(p => ({ ...p, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    className="text-sm h-9 font-mono" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">{tw('cardHolder')}</Label>
                <Input value={card.holder} onChange={e => setCard(p => ({ ...p, holder: e.target.value }))} className="text-sm h-9" />
              </div>
            </div>
          )}

          {/* ── CASH: pay at office ── */}
          {method === 'cash' && (
            <div className="rounded-xl border bg-gray-50 p-4 text-center space-y-1">
              <Banknote size={22} className="text-emerald-600 mx-auto" />
              <p className="text-sm text-gray-700">{tw('cashNote')}</p>
              <p className="text-xs text-gray-400">{tw('transferContent')}: <span className="font-mono">{reference}</span></p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={submitting}>{tw('cancelPayment')}</Button>
          <Button size="sm" onClick={onConfirm} disabled={confirmDisabled} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            {method === 'cash' ? tw('confirmOrder') : tw('confirmPaid')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, action, mono, highlight }: {
  label: string; value: string; action?: React.ReactNode; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm text-right truncate ${mono ? 'font-mono' : ''} ${highlight ? 'font-bold text-emerald-700' : 'text-gray-800'}`}>
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}
