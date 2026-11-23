/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#14211F",
        muted: "#72807C",
        canvas: "#F5F7F4",
        brand: "#176B57",
        mint: "#DDF2E8",
        line: "#E6EBE6",
        amber: "#F3B952",
      },
    },
  },
  plugins: [],
};
