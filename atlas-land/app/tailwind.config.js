/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // Atlas uses these surface and control opacities throughout its map UI.
      // Without explicit tokens Tailwind silently omits e.g. bg-*/92, leaving
      // panels transparent and text unreadable against the map.
      opacity: {
        7: '0.07', 8: '0.08', 12: '0.12', 14: '0.14', 15: '0.15',
        16: '0.16', 35: '0.35', 45: '0.45', 55: '0.55', 85: '0.85',
        88: '0.88', 92: '0.92', 94: '0.94', 96: '0.96',
      },
      colors: {
        tj: {
          'navy-dark': '#121c22',
          'navy-light': '#17262f',
          'gold': '#dbbb1c',
          'gold-hover': '#eaca3b',
          'slate': '#abafb5',
          'gray': '#e0e1e4',
        },
        primary: {
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
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        // Keep Atlas available on restricted enterprise networks. Nohm hosts
        // can supply Manrope locally; Windows/macOS/Linux use their native UI
        // face without waiting for a third-party font service.
        'sans': ['Manrope', '"Segoe UI"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
