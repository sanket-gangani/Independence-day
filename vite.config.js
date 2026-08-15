import { defineConfig } from 'vite';

/**
 * Resolves the public origin this build will be served from.
 *
 * Link previews need an absolute `og:image`; WhatsApp in particular will
 * quietly show no thumbnail at all rather than resolve a relative one. The
 * origin is not knowable from the source tree, so it comes from the
 * environment:
 *
 *   SITE_URL                        set it yourself, e.g. https://example.com
 *   VERCEL_PROJECT_PRODUCTION_URL   the stable production domain on Vercel
 *   VERCEL_URL                      the per-deployment URL on Vercel
 *
 * With none of them set it collapses to '', leaving root-relative paths —
 * correct for a root deploy, and the best that can be done without a domain.
 */
function siteUrl() {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return '';
}

/** Substitutes %SITE_URL% in index.html. */
function siteUrlPlugin() {
  return {
    name: 'site-url',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteUrl());
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [siteUrlPlugin()],
  server: { host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
