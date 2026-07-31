import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#667085",
        cloud: "#f6f8fb",
        line: "#e6ebf2",
        brand: "#2563eb",
        mint: "#11a37f",
        coral: "#f9735b",
        amber: "#f59e0b"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(25, 38, 66, 0.10)",
        lift: "0 22px 60px rgba(25, 38, 66, 0.14)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
