/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Design System V2 (docs/03_DESIGN_SYSTEM/02_COLOR_SYSTEM.md)
      colors: {
        primary: {
          DEFAULT: "#059669",
          dark: "#047857",
          light: "#ECFDF5",
        },
        success: "#059669",
        warning: "#F59E0B",
        danger: "#DC2626",
        background: "#FAF8F3",
        surface: "#FFFFFF",
        border: "#E8E6E1",
        muted: "#F4F3EF",
        "text-primary": "#0A0A0A",
        "text-secondary": "#6B7280",
        accent: "#0A0F0D",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "10px",
        card: "16px",
      },
      boxShadow: {
        "elevation-1": "0 2px 8px rgba(10,15,13,0.06)",
        "elevation-2": "0 8px 24px rgba(10,15,13,0.10)",
        "elevation-3": "0 16px 48px rgba(10,15,13,0.14)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "250ms",
      },
    },
  },
  plugins: [],
};
