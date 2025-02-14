import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vite.dev/config/
export default defineConfig({
  base: '/bioregions2',
  plugins: [react(), tsconfigPaths()],
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
  }
})
