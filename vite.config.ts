import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'path'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // Chrome Extension은 sourcemap을 production에서는 비활성화
    sourcemap: process.env.NODE_ENV !== 'production',
    rollupOptions: {
      input: {
        // index.html은 crxjs가 manifest의 action.default_popup을 보고 자동 처리
        // 명시적으로 추가하면 중복될 수 있으므로 crxjs에 위임
      },
    },
  },
})
