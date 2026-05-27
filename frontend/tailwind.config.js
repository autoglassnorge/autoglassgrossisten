/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        autoglass: {
          blue: '#0055A4',
          light: '#E8F1F8',
          dark: '#003D75',
        },
        // Industriell palett for landingsside
        carbon: {
          950: '#07090C',
          900: '#0E1116',
          850: '#13171E',
          800: '#1A1F26',
          700: '#252B34',
          600: '#363D48',
          500: '#4A525E',
          400: '#6B7280',
          300: '#9CA3AF',
          200: '#D1D5DB',
          100: '#E5E7EB',
        },
        steel: {
          DEFAULT: '#1A1F26',
          light: '#252B34',
          dark: '#0E1116',
        },
        glass: {
          cyan: '#00B4D8',
          cyanDark: '#0096B5',
          cyanLight: '#48CAE4',
          ice: '#CAF0F8',
        },
        signal: {
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 4s linear infinite',
        'count-up': 'countUp 1.2s ease-out',
        'float-up': 'floatUp 12s linear infinite',
        'float-up-slow': 'floatUp 18s linear infinite',
        'float-up-fast': 'floatUp 8s linear infinite',
        'drift': 'drift 20s ease-in-out infinite alternate',
        'twinkle': 'twinkle 4s ease-in-out infinite',
        'gradient-shift': 'gradientShift 15s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        countUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        floatUp: {
          '0%': { transform: 'translateY(100vh) scale(0)', opacity: '0' },
          '10%': { opacity: '0.6' },
          '90%': { opacity: '0.4' },
          '100%': { transform: 'translateY(-10vh) scale(1)', opacity: '0' },
        },
        drift: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(30px)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.8' },
        },
        gradientShift: {
          '0%': { opacity: '0.12' },
          '50%': { opacity: '0.22' },
          '100%': { opacity: '0.12' },
        },
      },
      backgroundImage: {
        'grid-carbon': "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        'grid-light': "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
        'radial-spot': "radial-gradient(circle at 50% 0%, rgba(0,180,216,0.18), transparent 60%)",
      },
      backgroundSize: {
        'grid': '48px 48px',
        'grid-sm': '24px 24px',
      },
      boxShadow: {
        'glow-cyan': '0 0 24px rgba(0, 180, 216, 0.35)',
        'inset-line': 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
}
