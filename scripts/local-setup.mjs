import { copyFileSync, constants, mkdirSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command === process.execPath ? 'Node/npm' : command} failed. ${result.error?.message ?? 'See the output above.'}`);
  }
  return result.stdout?.trim();
}

try {
  if (!process.env.npm_execpath) throw new Error('Run this script with npm run setup:local.');
  // Fail early with a useful message before installing dependencies.
  try {
    run('docker', ['compose', 'version']);
    run('docker', ['info'], true);
  } catch {
    throw new Error('Docker is unavailable. Install/start Docker Desktop with Linux containers, wait until it is running, then retry npm run setup:local.');
  }
  mkdirSync('.local/npm-cache', { recursive: true });
  run(process.execPath, [process.env.npm_execpath, 'ci', '--cache', fileURLToPath(new URL('../.local/npm-cache', import.meta.url))]);
  try {
    copyFileSync('.env.example', '.env', constants.COPYFILE_EXCL);
    if (process.platform !== 'win32') chmodSync('.env', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  loadEnvFile('.env');
  if (process.env.AUTH_MODE !== 'demo' || process.env.NODE_ENV === 'production') {
    throw new Error('Local setup requires AUTH_MODE=demo outside production. Check .env and your terminal environment.');
  }
  run('docker', ['compose', 'up', '-d', '--wait', 'db']);
  run(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts']);
  run(process.execPath, ['--import', 'tsx', 'scripts/seed.ts']);
  const exists = run('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'response', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='response_test'"], true);
  if (exists !== '1') run('docker', ['compose', 'exec', '-T', 'db', 'createdb', '-U', 'response', 'response_test']);
  console.log('Local setup complete. Run npm run dev:local and leave that terminal open.');
} catch (error) {
  console.error(`Setup stopped: ${error.message}`);
  process.exitCode = 1;
}
