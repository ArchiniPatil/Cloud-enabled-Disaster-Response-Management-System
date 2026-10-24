import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({testDir:'tests/browser',workers:1,fullyParallel:false,timeout:60000,use:{baseURL:'http://localhost:5173',headless:true,launchOptions:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}:undefined,screenshot:'only-on-failure',trace:'retain-on-failure'},webServer:{command:'npm run db:migrate && npm run db:seed && npm run dev',env:{AUTH_MODE:'demo'},url:'http://localhost:5173',reuseExistingServer:!process.env.CI,timeout:60000}});
