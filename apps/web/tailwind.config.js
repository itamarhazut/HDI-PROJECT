import basePreset from "@repo/config/tailwind";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [basePreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};
