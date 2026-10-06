'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Theme = 'light' | 'dark';

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
}

export function ThemeSwitcher() {
  const t = useTranslations('common');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let initial: Theme = 'light';
    try {
      const saved = localStorage.getItem('theme') as Theme | null;
      initial = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch { /* ignore */ }
    setTheme(initial);
    apply(initial);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    apply(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
      title={theme === 'dark' ? t('lightMode') : t('darkMode')}
      className="w-8.5 h-8.5 flex items-center justify-center rounded-full text-[#13426f] hover:bg-[#bde1f9]/40 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
