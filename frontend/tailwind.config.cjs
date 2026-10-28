/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  darkMode: ["class"],
  // Add light mode variant for dark-first design
  plugins: [
    require("tailwindcss-animate"),
    function({ addVariant }) {
      addVariant('light', '.light &')
    }
  ],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: ['Inter', ...defaultTheme.fontFamily.sans],
  			ubuntu: ['Ubuntu', ...defaultTheme.fontFamily.sans],
  			poppins: ['Poppins', ...defaultTheme.fontFamily.sans],
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			whatsapp: {
  				green: '#25D366',
  				teal: '#128C7E',
  				'teal-dark': '#075E54',
  				light: '#DCF8C6'
  			},
  			spruce: {
  				DEFAULT: '#0f5c62',
  				dark: '#0b4a4f',
  				light: '#e6f2f1',
  				hover: 'rgba(255, 255, 255, 0.08)',
  				active: 'rgba(255, 255, 255, 0.15)'
  			},
  			mint: {
  				50: '#f0fdf9',
  				100: '#e6f4f1',
  				200: '#c5ece3',
  				300: '#94ddcc',
  				400: '#5ac4af',
  				500: '#34a893',
  				600: '#0b7c68',
  				700: '#1b6757',
  				800: '#195247',
  				900: '#17443c'
  			},
  			nebula: {
  				start: '#4f39f6',
  				middle: '#7c4dff',
  				end: '#9d50bb'
  			},
  			facebook: {
  				DEFAULT: '#1877F2',
  				dark: '#0C5DC7',
  				hover: '#166FE5',
  				hoverDark: '#0A4DAD'
  			},
  			// Violet color palette (primary accent)
  			violet: {
  				50: '#ecf6f4',
  				100: '#d3ebe6',
  				200: '#a8d6cc',
  				300: '#72bcae',
  				400: '#2e9a86',
  				500: '#127569',
  				600: '#0b5a55',
  				700: '#0a4a47',
  				800: '#0b3c3a',
  				900: '#0a3230',
  				950: '#061f1e'
  			},
  			// Glass effect colors
  			glass: {
  				bg: 'var(--glass-bg)',
  				'bg-hover': 'var(--glass-bg-hover)',
  				border: 'var(--glass-border)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--reka-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--reka-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'pulse-glow': {
  				'0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
  				'50%': { opacity: '1', transform: 'scale(1.03)' }
  			},
  			'float-slow': {
  				'0%, 100%': { transform: 'translateY(0)' },
  				'50%': { transform: 'translateY(-3px)' }
  			},
  			'slide-right': {
  				from: { opacity: '0', transform: 'translateX(-8px)' },
  				to: { opacity: '1', transform: 'translateX(0)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
  			'float-slow': 'float-slow 3s ease-in-out infinite',
  			'slide-right': 'slide-right 0.2s ease-out'
  		},
  		// Glass effect backdrop blur
  		backdropBlur: {
  			xs: '2px'
  		}
  	}
  },
}
