import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const disableHmr = String(process.env.VITE_DISABLE_HMR).toLowerCase() === 'true'
  const base = mode === 'production' ? './' : '/'

  const server = {
    port: 5173,
    strictPort: false,
    hmr: disableHmr
      ? false
      : {
          overlay: false
        },
    proxy: {
      '/api': {
        target: `http://localhost:${Number(process.env.API_PORT || 3000)}`,
        changeOrigin: true
      }
    }
  }

  const plugins = [
    ...(disableHmr
      ? []
      : [
          base44({
            legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
            hmrNotifier: false,
            navigationNotifier: false,
            visualEditAgent: false
          })
        ]),
    react()
  ]

  return {
    base,
    logLevel: 'info',
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
        'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js')
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@radix-ui/react-dropdown-menu']
    },
    server,
    plugins
  }
});
