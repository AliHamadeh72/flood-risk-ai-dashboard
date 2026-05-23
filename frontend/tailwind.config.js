/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182026",
        panel: "#f7f9f8",
        river: "#1d7088",
        alert: "#c94132",
        amber: "#d98c20",
        safe: "#287b53"
      }
    }
  },
  plugins: []
};
