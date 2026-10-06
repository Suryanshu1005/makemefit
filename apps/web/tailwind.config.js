/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#090A0F',
          card: '#12151E',
          elevated: '#1A1F2C',
          input: '#161A26',
          border: '#23293A',
          hover: '#343D55',
        },
        kinetic: {
          DEFAULT: '#10B981',
          hover: '#059669',
          glow: 'rgba(16, 185, 129, 0.25)',
        },
        streak: {
          DEFAULT: '#FF6B00',
          hover: '#EA580C',
          glow: 'rgba(255, 107, 0, 0.25)',
        },
        xp: {
          DEFAULT: '#8B5CF6',
          hover: '#7C3AED',
          glow: 'rgba(139, 92, 246, 0.25)',
        },
        macro: {
          protein: '#FF5C5C',
          carbs: '#FBBF24',
          fat: '#38BDF8',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.45)',
        elevated: '0 12px 32px -4px rgba(0, 0, 0, 0.65)',
        'glow-kinetic': '0 0 24px -4px rgba(16, 185, 129, 0.35)',
        'glow-streak': '0 0 24px -4px rgba(255, 107, 0, 0.35)',
        'glow-xp': '0 0 24px -4px rgba(139, 92, 246, 0.35)',
      },
      borderRadius: {
        xl: '20px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
};
