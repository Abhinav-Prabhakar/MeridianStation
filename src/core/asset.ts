/**
 * Static asset URL.
 *
 * Textures, HDRs and bakes live in `docs/` because that folder *is* the
 * published site root on GitHub Pages. In dev Vite serves the project root, so
 * the path needs the `docs/` prefix; in a build the folder is the root and only
 * the base prefix is needed (`/` locally, `/<repo>/` on Pages).
 */
const prefix = import.meta.env.DEV ? "/docs/" : import.meta.env.BASE_URL;

export const asset = (path: string) => `${prefix}${path.replace(/^\/+/, "")}`;
