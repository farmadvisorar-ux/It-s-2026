import { defineConfig } from 'astro/config';
import vercel from 'astro/integrations/vercel';

// Vercel adapter with server-side rendering enabled for proper cookie handling
export default defineConfig({
  site: 'https://anysize.shop',
  output: 'hybrid',
  adapter: vercel({
    webAnalytics: { enabled: false },
  }),
  build: { format: 'directory' },
  compressHTML: true,
});
