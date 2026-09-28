import { defineConfig } from '@playwright/test';

const linuxRuntime =
  process.platform === 'linux' ? (await import('@sparticuz/chromium')).default : null;
const linuxLaunchOptions = linuxRuntime
  ? {
      executablePath: await linuxRuntime.executablePath(),
      args: linuxRuntime.args,
    }
  : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: linuxLaunchOptions },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/demo/test.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
