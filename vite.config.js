import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const pfxPath = fileURLToPath(
  new URL("./certificates/bright-mind-lan.pfx", import.meta.url),
);
const httpsEnabledPath = fileURLToPath(
  new URL("./certificates/https-enabled", import.meta.url),
);
const lanHttps = existsSync(pfxPath) && existsSync(httpsEnabledPath)
  ? {
      pfx: readFileSync(pfxPath),
      passphrase: "bright-mind-local-dev-only",
    }
  : undefined;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    https: lanHttps,
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/uploads": "http://127.0.0.1:3001",
      "/socket.io": { target: "http://127.0.0.1:3001", ws: true },
    },
  },
});
