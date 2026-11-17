/**
 * Static asset URL.
 *
 * Everything lives under `public/`, so a build served from a sub-path (GitHub
 * Pages) needs the base prefix. `import.meta.env.BASE_URL` is "/" in dev and
 * "/<repo>/" in the Pages build — see vite.config.ts.
 */
export const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
