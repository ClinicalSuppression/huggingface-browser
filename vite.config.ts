/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const cspForMode = (mode: string) => {
  const directives = [
    "default-src 'self'",
    "script-src 'self'", // Renderer scripts and bundled assets are self-hosted.
    "frame-src https://huggingface.co", // The model detail view embeds Hugging Face in an Electron webview.
    "connect-src 'self' https://huggingface.co", // HF API/model metadata and configured app requests.
    "img-src 'self' data: https://huggingface.co", // App icons, data images, and HF model webview content.
    "font-src 'self' data:", // Bundled fonts and inline font data.
    "object-src 'none'", // No plugin/object content is used.
    "base-uri 'self'", // The app uses only its own base URL.
    "form-action 'self'", // Forms must not submit to external origins.
    "style-src 'self' 'unsafe-inline'", // React components use inline style attributes.
  ];

  if (mode === 'development') {
    // Vite's HMR client connects to the configured strictPort development server.
    directives[2] += ' ws://localhost:5173 ws://127.0.0.1:5173';
  }

  return directives.join('; ');
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'mode-aware-csp',
      transformIndexHtml: {
        handler(_html, context) {
      const policy = cspForMode(context.server ? 'development' : 'production');
      return [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: policy,
        },
        injectTo: 'head',
      }];
        },
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts', 'electron/**/*.test.ts'],
    exclude: ['dist/**', 'dist-electron/**', 'node_modules/**'],
  },
});
