'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggle = () => {
    const next = locale === 'vi' ? 'en' : 'vi';
    router.replace(pathname.replace(`/${locale}`, `/${next}`));
  };

  return (
    <button
      onClick={toggle}
      className="text-xs font-bold px-3 py-1 rounded-full border border-[#d0d5dd] bg-white text-[#13426f] hover:bg-[#eef6ff] transition-all shadow-2xs cursor-pointer"
    >
      {locale === 'vi' ? '🇻🇳 VI' : '🇺🇸 EN'}
    </button>
  );
}
