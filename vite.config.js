import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: set this to '/<your-repo-name>/' before deploying to GitHub
// Pages (e.g. '/circlesfundme-ops/'). Keep it '/' for local dev if you
// prefer — the GitHub Actions workflow overrides it via BASE_PATH anyway.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
})
