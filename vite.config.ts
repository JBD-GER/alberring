import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "native-content-security-policy",
      transformIndexHtml(html) {
        if (mode !== "native") return html;
        const policy =
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self' blob: https://*.supabase.co; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";
        return html.replace(
          "<head>",
          `<head><meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
    VitePWA({
      disable: mode === "native",
      registerType: "prompt",
      manifest: {
        name: "Alberring Mitarbeiter-App",
        short_name: "Alberring",
        description: "Die Mitarbeiter-App für Alberring Ambulante Pflege.",
        lang: "de",
        dir: "ltr",
        categories: ["business", "productivity", "medical"],
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "portrait-primary",
        start_url: "/app/dashboard",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/auth/, /^\/storage/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173 },
  test: {
    exclude: [
      "src/test/e2e/**",
      "supabase/functions/**/*.test.ts",
      "node_modules/**",
    ],
  },
}));
