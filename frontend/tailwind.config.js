/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1F2937",
        panel: "#DBEAFE",
        river: "#38BDF8",
        bluewave: "#60A5FA",
        alert: "#1F2937",
        amber: "#60A5FA",
        safe: "#38BDF8"
      }
    }
  },
  plugins: []
};
