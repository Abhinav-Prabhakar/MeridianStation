import { defineConfig } from "vite";

/**
 * Deployment shape
 * ----------------
 * GitHub Pages serves the `docs/` folder of `main` — no extra branch, no
 * Actions. So `docs/` is both the published site root and the home of the big
 * binary assets (textures, HDRs, bakes); the build only has to drop
 * `index.html` + `assets/` in beside them (see scripts/deploy.sh).
 *
 * That means Vite must not copy a `public/` folder into the build, hence
 * `publicDir: false`. In dev the assets are read straight out of `docs/` —
 * `src/core/asset.ts` adds that prefix.
 */
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.VITE_BASE ?? (repo ? `/${repo}/` : "/");

export default defineConfig({
  base,
  publicDir: false,
  server: { host: true, port: 5173 },
  build: { target: "es2022", assetsInlineLimit: 0, outDir: "dist" },
  assetsInclude: ["**/*.hdr"],
});
