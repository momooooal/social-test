import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(async () => {
  const port = Number(process.env.PORT || 5173);
  const base = process.env.BASE_PATH || './';
  const plugins = [react(), tailwindcss()];
  if (process.env.NODE_ENV !== 'production' && process.env.REPL_ID) {
    const [{ default: runtimeErrorOverlay }, cartographerModule, devBannerModule] = await Promise.all([
      import('@replit/vite-plugin-runtime-error-modal'),
      import('@replit/vite-plugin-cartographer'),
      import('@replit/vite-plugin-dev-banner'),
    ]);
    plugins.push(runtimeErrorOverlay(), cartographerModule.cartographer({ root: path.resolve(import.meta.dirname, '..') }), devBannerModule.devBanner());
  }
  return {
    base,
    plugins,
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets') }, dedupe: ['react', 'react-dom'] },
    root: path.resolve(import.meta.dirname),
    build: { outDir: path.resolve(import.meta.dirname, 'dist/public'), emptyOutDir: true },
    server: { port, strictPort: false, host: '0.0.0.0', allowedHosts: true, fs: { strict: true } },
    preview: { port, host: '0.0.0.0', allowedHosts: true },
  };
});
