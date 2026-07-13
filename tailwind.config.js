/** Build-time Tailwind — a faithful port of the old inline CDN config (index.html).
 *  The CDN play script was compiling classes in the browser on every load. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.tsx', './*.ts', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Chakra Petch', 'sans-serif'],
      },
      colors: {
        brand: {
          dark: '#0f172a',
          accent: '#3b82f6',
          gold: '#fbbf24',
        },
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'bounce-sm': 'bounce-sm 1s infinite',
        'collect': 'collect 0.8s ease-out forwards',
        'hop': 'hop 0.4s infinite alternate',
        'spin-slow': 'spin 3s linear infinite',
        'fade-in': 'fade-in 0.25s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'bounce-sm': {
          '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8,0,1,1)' },
          '50%': { transform: 'none', animationTimingFunction: 'cubic-bezier(0,0,0.2,1)' },
        },
        collect: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-50px) scale(1.5)' },
        },
        hop: {
          '0%': { transform: 'translateZ(0px)' },
          '100%': { transform: 'translateZ(10px)' },
        },
      },
    },
  },
  plugins: [],
};
