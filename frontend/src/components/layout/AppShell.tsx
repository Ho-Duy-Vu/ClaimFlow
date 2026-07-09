'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-white dark:bg-gray-900 dark:border-gray-800 flex items-center justify-between md:justify-end px-4 md:px-6 gap-2 md:gap-4 shadow-sm shrink-0">
          <button
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-1 md:gap-2">
            <NotificationBell />
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 text-gray-900 dark:text-gray-100">{children}</main>
      </div>
    </div>
  );
}
