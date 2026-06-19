import { Sidebar } from '@/components/layout/Sidebar';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex h-screen bg-gray-50 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 border-b bg-white flex items-center justify-end px-6 gap-4 shadow-sm shrink-0">
              <LanguageSwitcher />
            </header>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
