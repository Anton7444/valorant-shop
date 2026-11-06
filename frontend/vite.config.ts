import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Which commit this build was made from (shown on the About page). CI passes it in; locally ask git.
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const commit = process.env.VITE_COMMIT_SHA || git('rev-parse HEAD')
const commitDate = git('log -1 --format=%cI') || ''
const subject = git('log -1 --format=%s') || ''

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_COMMIT_DATE__: JSON.stringify(commitDate),
    __APP_COMMIT_SUBJECT__: JSON.stringify(subject),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
