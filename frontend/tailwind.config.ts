import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Relief Tokens (UI.md)
        'warm-cream': '#f9f7f0',
        'snow': '#ffffff',
        'ink': '#333333',
        'charcoal': '#212121',
        'fog': '#d0d5dd',
        'slate-sub': '#616c8a',
        'slate-border': '#40444e',
        'deep-harbor': '#13426f',
        'sky-pop': '#2e96ff',
        'deep-wave': '#0254a5',
        'sky-tint': '#bde1f9',
        'sky-wash': '#cde7fb',
        'info-mist': '#73b9ff',
        'sky-mid': '#50a7ff',
      },
      spacing: {
        '4.5': '1.125rem',
      },
      boxShadow: {
        'pop': 'rgba(154, 207, 246, 0.5) 0px 7px 0px 0px',
        'pop-sm': 'rgba(154, 207, 246, 0.5) 0px 5px 0px 0px',
        'pop-xs': 'rgba(154, 207, 246, 0.5) 0px 3px 0px 0px',
        'harbor': 'rgba(0, 0, 0, 0.08) 0px 6px 0px 0px',
        'card': 'rgba(0, 0, 0, 0.04) 0px 4px 14px 0px',
      },
      borderRadius: {
        'card': '22px',
        'hero': '49px',
        'pill': '9999px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
