/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Background colors
        bg: {
          primary: '#0f0f0f',
          secondary: '#1a1a1a',
          tertiary: '#252525',
          hover: '#2a2a2a',
        },
        // Text colors
        text: {
          primary: '#ffffff',
          secondary: '#a0a0a0',
          muted: '#666666',
        },
        // Accent colors (athletic orange)
        accent: {
          primary: '#ff6b35',
          secondary: '#ff8c42',
          dark: '#e55a25',
        },
        // Workout type colors
        workout: {
          easy: '#22c55e',      // Green
          long: '#3b82f6',      // Blue
          tempo: '#f97316',     // Orange
          intervals: '#ef4444', // Red
          strength: '#a855f7',  // Purple
          rest: '#525252',      // Gray
          race: '#eab308',      // Gold
          recovery: '#14b8a6',  // Teal
        },
        // Status colors
        status: {
          completed: '#22c55e',
          missed: '#ef4444',
          upcoming: '#3b82f6',
          inprogress: '#f97316',
        },
        // Border color
        border: {
          DEFAULT: '#333333',
          light: '#404040',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
