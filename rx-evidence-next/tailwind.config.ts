import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          fg: "rgb(var(--brand-fg) / <alpha-value>)",
          subtle: "rgb(var(--brand-subtle) / <alpha-value>)",
          muted: "rgb(var(--brand-muted) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          border: "rgb(var(--surface-border) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
        },
        accent: {
          success: "rgb(var(--accent-success) / <alpha-value>)",
          "success-soft": "rgb(var(--accent-success-soft) / <alpha-value>)",
          warning: "rgb(var(--accent-warning) / <alpha-value>)",
          "warning-soft": "rgb(var(--accent-warning-soft) / <alpha-value>)",
          danger: "rgb(var(--accent-danger) / <alpha-value>)",
          "danger-soft": "rgb(var(--accent-danger-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
