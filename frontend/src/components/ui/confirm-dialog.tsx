'use client';

import * as React from 'react';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'danger' | 'warning';

interface ConfirmOptions {
  title: string;
  message?: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
}

interface PendingDialog extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}

const variantConfig: Record<Variant, {
  icon: typeof HelpCircle;
  iconBg: string;
  iconColor: string;
  confirmBtnCls: string;
}> = {
  default: {
    icon: HelpCircle,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    confirmBtnCls: '',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBtnCls: 'bg-amber-600 hover:bg-amber-700',
  },
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBtnCls: 'bg-red-600 hover:bg-red-700',
  },
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = React.useState<PendingDialog | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...opts, resolve });
    });
  }, []);

  const handle = (result: boolean) => {
    if (!dialog) return;
    dialog.resolve(result);
    setDialog(null);
  };

  // Esc / Enter shortcuts
  React.useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handle(false);
      if (e.key === 'Enter') handle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && <Dialog dialog={dialog} onClose={handle} />}
    </ConfirmContext.Provider>
  );
}

function Dialog({ dialog, onClose }: { dialog: PendingDialog; onClose: (r: boolean) => void }) {
  const variant = dialog.variant ?? 'default';
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4 animate-in fade-in-0 duration-150"
      onClick={() => onClose(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-4">
          <div className={cn('shrink-0 w-11 h-11 rounded-full flex items-center justify-center', cfg.iconBg)}>
            <Icon size={20} className={cfg.iconColor} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900">{dialog.title}</h3>
            {dialog.message && (
              <div className="mt-1.5 text-sm text-gray-600 leading-relaxed">{dialog.message}</div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose(false)}>
            {dialog.cancelLabel ?? 'Hủy'}
          </Button>
          <Button
            size="sm"
            className={cfg.confirmBtnCls}
            onClick={() => onClose(true)}
            autoFocus
          >
            {dialog.confirmLabel ?? 'Xác nhận'}
          </Button>
        </div>
      </div>
    </div>
  );
}
