'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  title?: string;
  message: string;
  variant: Variant;
}

interface ToastContextValue {
  toast: (opts: { message: string; title?: string; variant?: Variant }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const variantStyle: Record<Variant, { border: string; bg: string; icon: LucideIcon; iconCls: string }> = {
  success: { border: 'border-green-200',  bg: 'bg-white',  icon: CheckCircle,    iconCls: 'text-green-500' },
  error:   { border: 'border-red-200',    bg: 'bg-white',  icon: XCircle,        iconCls: 'text-red-500' },
  info:    { border: 'border-blue-200',   bg: 'bg-white',  icon: Info,           iconCls: 'text-blue-500' },
  warning: { border: 'border-amber-200',  bg: 'bg-white',  icon: AlertTriangle,  iconCls: 'text-amber-500' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const push = React.useCallback((message: string, variant: Variant, title?: string) => {
    const id = ++idRef.current;
    setItems(prev => [...prev, { id, message, variant, title }]);
  }, []);

  const remove = React.useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({
    toast: ({ message, title, variant = 'info' }) => push(message, variant, title),
    success: (m, t) => push(m, 'success', t),
    error:   (m, t) => push(m, 'error', t),
    info:    (m, t) => push(m, 'info', t),
    warning: (m, t) => push(m, 'warning', t),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map(item => {
          const v = variantStyle[item.variant];
          const Icon = v.icon;
          return (
            <ToastPrimitive.Root
              key={item.id}
              onOpenChange={(open) => { if (!open) remove(item.id); }}
              className={cn(
                'pointer-events-auto rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3',
                'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-4',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-4',
                v.border, v.bg,
              )}
            >
              <Icon size={18} className={cn('shrink-0 mt-0.5', v.iconCls)} />
              <div className="min-w-0 flex-1">
                {item.title && <ToastPrimitive.Title className="text-sm font-semibold text-gray-900">{item.title}</ToastPrimitive.Title>}
                <ToastPrimitive.Description className="text-sm text-gray-700">{item.message}</ToastPrimitive.Description>
              </div>
              <ToastPrimitive.Close className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={14} />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
