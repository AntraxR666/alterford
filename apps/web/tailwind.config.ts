import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vanilla: {
          bg: "#f7fafc",
          panel: "#ffffff",
          text: "#0f172a",
          muted: "#64748b",
          line: "#dbe4ee",
          accent: "#2563eb"
        },
        underworld: {
          bg: "#05070d",
          panel: "#0c1020",
          text: "#e2f7ff",
          muted: "#8aa4b8",
          line: "#1b2a43",
          neon: "#22d3ee",
          hot: "#f43f5e"
        }
      }
    }
  },
  plugins: []
} satisfies Config;
