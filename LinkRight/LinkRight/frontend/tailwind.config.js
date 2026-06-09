/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}',
    './src/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Base surfaces ──────────────────────────────────────────────────────
        // Deep navy-indigo page background (outermost layer)
        'app-bg':        '#0d0d1f',
        // Card / panel surface (forms, modals)
        'surface':       '#161628',
        // Elevated surface (inputs, dropdowns, inner cards)
        'surface-raised':'#1e1e38',
        // Subtle border between elements
        'border':        '#2a2a50',
        // Slightly brighter border for focus / hover
        'border-bright': '#3d3d70',

        // ── Purple accent palette ──────────────────────────────────────────────
        // Primary action / selected state
        'accent': {
          DEFAULT: '#7c3aed',   // violet-700 equivalent
          light:   '#a78bfa',   // violet-400 — labels, icons on dark
          bright:  '#c084fc',   // purple-400 — hover highlights
          muted:   '#4c1d95',   // violet-900 — subtle tinted backgrounds
          glow:    '#8b5cf6',   // violet-500 — glow / ring colour
        },

        // ── CTA button (magenta-purple gradient endpoints) ─────────────────────
        'cta': {
          from: '#a855f7',   // purple-500
          to:   '#7c3aed',   // violet-700
        },

        // ── Text ──────────────────────────────────────────────────────────────
        'text': {
          primary:   '#f0eeff',   // near-white with a hint of lavender
          secondary: '#9b8ec4',   // muted purple-gray
          muted:     '#9484c0',   // dimmed — placeholders, disabled (WCAG AA on dark surfaces)
          inverse:   '#ffffff',
        },

        // ── Semantic / status ──────────────────────────────────────────────────
        'success': '#34d399',   // emerald-400
        'warning': '#fbbf24',   // amber-400
        'danger':  '#f87171',   // red-400
      },

      // ── Background gradients ─────────────────────────────────────────────────
      backgroundImage: {
        // CTA button gradient (left → right, matches the screenshot's purple→violet)
        'cta-gradient': 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
        // Subtle page vignette
        'app-vignette':
          'radial-gradient(ellipse at 50% 0%, #1a1040 0%, #0d0d1f 70%)',
      },

      // ── Box shadows ──────────────────────────────────────────────────────────
      boxShadow: {
        // Soft purple glow for focused inputs / selected cards
        'glow-sm':  '0 0 0 2px rgba(139, 92, 246, 0.45)',
        'glow':     '0 0 0 3px rgba(139, 92, 246, 0.50)',
        'glow-lg':  '0 0 16px 4px rgba(139, 92, 246, 0.30)',
        // Elevated card shadow
        'card':     '0 4px 24px 0 rgba(0, 0, 0, 0.55)',
        'card-lg':  '0 8px 40px 0 rgba(0, 0, 0, 0.70)',
      },

      // ── Border radius ────────────────────────────────────────────────────────
      borderRadius: {
        'input': '8px',
        'card':  '12px',
        'modal': '16px',
      },

      // ── Typography ───────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        'xxs': ['0.65rem', { lineHeight: '1rem' }],
      },

      // ── Transitions ──────────────────────────────────────────────────────────
      transitionDuration: {
        DEFAULT: '150ms',
      },

      // ── Ring (focus) ─────────────────────────────────────────────────────────
      ringColor: {
        DEFAULT: '#8b5cf6',
        accent:  '#8b5cf6',
      },
      ringOffsetColor: {
        DEFAULT: '#161628',
      },
    },
  },
  plugins: [],
};
