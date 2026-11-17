import { defineConfig } from "vite";

/**
 * On GitHub Pages the site lives at https://<user>.github.io/<repo>/, so the
 * build needs that prefix. CI passes GITHUB_REPOSITORY, which is all we need —
 * no hardcoded repo name.
 */
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.VITE_BASE ?? (repo ? `/${repo}/` : "/");

export default defineConfig({
  base,
  server: { host: true, port: 5173 },
  build: { target: "es2022", assetsInlineLimit: 0 },
  assetsInclude: ["**/*.hdr"],
});
