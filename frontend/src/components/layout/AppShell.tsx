'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher';

function getPageInfo(pathname: string | null) {
  if (!pathname) {
    return {
      section: 'Hệ thống /',
      title: 'ClaimFlow Portal',
      badgeColor: 'bg-[#bde1f9]/50 text-[#13426f] border-[#2e96ff]/30',
      dotColor: 'bg-[#2e96ff]',
    };
  }

  if (pathname.includes('/admin')) {
    return {
      section: 'Hệ thống /',
      title: 'Quản trị hệ thống (Admin)',
      badgeColor: 'bg-purple-100/70 text-purple-900 border-purple-200',
      dotColor: 'bg-purple-600',
    };
  }
  if (pathname.includes('/reviewer')) {
    return {
      section: 'Nghiệp vụ /',
      title: 'Thẩm định hồ sơ (Reviewer)',
      badgeColor: 'bg-indigo-100/70 text-indigo-900 border-indigo-200',
      dotColor: 'bg-indigo-600',
    };
  }
  if (pathname.includes('/claims')) {
    return {
      section: 'Bồi thường /',
      title: 'Hồ sơ & Yêu cầu bồi thường',
      badgeColor: 'bg-blue-100/70 text-blue-900 border-blue-200',
      dotColor: 'bg-blue-600',
    };
  }
  if (pathname.includes('/policies')) {
    return {
      section: 'Bảo hiểm /',
      title: 'Hợp đồng & Gói bảo vệ',
      badgeColor: 'bg-emerald-100/70 text-emerald-900 border-emerald-200',
      dotColor: 'bg-emerald-600',
    };
  }
  if (pathname.includes('/analytics')) {
    return {
      section: 'Dữ liệu /',
      title: 'Báo cáo & Phân tích',
      badgeColor: 'bg-amber-100/70 text-amber-900 border-amber-200',
      dotColor: 'bg-amber-600',
    };
  }
  if (pathname.includes('/documents')) {
    return {
      section: 'Tài liệu /',
      title: 'Kho lưu trữ OCR',
      badgeColor: 'bg-cyan-100/70 text-cyan-900 border-cyan-200',
      dotColor: 'bg-cyan-600',
    };
  }
  if (pathname.includes('/chatbot')) {
    return {
      section: 'Trợ lý AI /',
      title: 'Trợ lý ClaimFlow 24/7',
      badgeColor: 'bg-sky-100/70 text-sky-900 border-sky-200',
      dotColor: 'bg-sky-600',
    };
  }
  if (pathname.includes('/risk-map')) {
    return {
      section: 'Hạ tầng /',
      title: 'Bản đồ số Goong.io',
      badgeColor: 'bg-[#bde1f9]/50 text-[#13426f] border-[#2e96ff]/30',
      dotColor: 'bg-emerald-500',
    };
  }
  return {
    section: 'Tổng quan /',
    title: 'Bảng điều khiển',
    badgeColor: 'bg-[#bde1f9]/50 text-[#13426f] border-[#2e96ff]/30',
    dotColor: 'bg-[#2e96ff]',
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isChatbot = pathname?.includes('/chatbot');
  const isRiskMap = pathname?.includes('/risk-map');
  const pageInfo = getPageInfo(pathname);

  return (
    <div className="flex h-screen bg-[#f9f7f0] text-[#333333] overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden">
        <header className="relative z-30 h-11 border-b border-[#d0d5dd] bg-[#f9f7f0]/95 backdrop-blur-md flex items-center justify-between px-3 md:px-5 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-full text-[#13426f] hover:bg-[#bde1f9]/40 transition-colors shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Menu"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-[#13426f] truncate">
              <span className="hidden sm:inline text-[#616c8a] font-normal">{pageInfo.section}</span>
              <span className={`${pageInfo.badgeColor} px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-xs`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pageInfo.dotColor} animate-pulse`} />
                {pageInfo.title}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <NotificationBell />
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </header>
        <main
          className={`flex-1 min-w-0 min-h-0 text-[#333333] ${
            isRiskMap
              ? 'overflow-hidden flex flex-col p-2.5 sm:p-3'
              : isChatbot
              ? 'overflow-hidden flex flex-col p-0'
              : 'overflow-y-auto p-3.5 sm:p-4 md:p-5'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
