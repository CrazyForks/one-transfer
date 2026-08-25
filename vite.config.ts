import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

const appVersion = process.env.npm_package_version || "0.0.0";
const buildTime = new Date().toISOString();
const appCommit = process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || "development";

export default defineConfig({
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
    __APP_COMMIT__: JSON.stringify(appCommit),
  },
  plugins: [
    {
      name: "one-transfer-version-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ version: appVersion, buildTime, commit: appCommit }),
        });
      },
    },
    basicSsl(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["one-transfer-restore.bat", "app-update-checker.worker.js"],
      manifest: {
        name: "One Transfer",
        short_name: "One Transfer",
        description: "用光传递数据，并通过文本剪贴板传入文件。",
        theme_color: "#f5f5f7",
        background_color: "#f5f5f7",
        display: "standalone",
        start_url: "/",
      },
      workbox: {
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,wasm}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "chrome109",
    cssTarget: "chrome109",
  },
  server: { host: "127.0.0.1" },
});
