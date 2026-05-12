import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#183954',
          50:  '#EEF2F6',
          100: '#D0DBE6',
          200: '#A1B8CC',
          300: '#7294B3',
          400: '#437199',
          500: '#183954',
          600: '#132E43',
          700: '#0E2232',
          800: '#091721',
          900: '#040B11',
        },
        orange: {
          DEFAULT: '#E8943A',
          50:  '#FDF4EC',
          100: '#FAE4CC',
          200: '#F5C999',
          300: '#F0AE66',
          400: '#EC9C4D',
          500: '#E8943A',
          600: '#D4782A',
          700: '#A85E21',
          800: '#7C4418',
          900: '#502C0F',
        },
        dark: '#1A202C',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 2px 16px 0 rgba(24,57,84,0.08)',
        'card-hover': '0 8px 32px 0 rgba(24,57,84,0.14)',
        nav: '0 2px 12px 0 rgba(24,57,84,0.10)',
        btn: '0 4px 12px 0 rgba(232,148,58,0.30)',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
}

export default config
