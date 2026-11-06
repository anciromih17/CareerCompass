// One entry point for local execution and CI. No existing MongoDB is used.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer as httpServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';


const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
mkdirSync('e2e/.runtime', { recursive: true });
const children = [];
const project = 'demo-careercompass-e2e';
const authURL = 'http://127.0.0.1:49099';
const env = { ...process.env };
// Override every local env key without reading or printing its value.
for (const dir of ['backend', 'frontend']) {
  for (const file of ['env', '.env', '.env.local', '.env.development', '.env.development.local']) {
    try {
      for (const line of readFileSync(`${dir}/${file}`, 'utf8').split('\n')) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/);
        if (match) env[match[1]] = '';
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
Object.assign(env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  E2E_BUILD_CPUS: '2', E2E_NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4400',
  PORT: '4400', NEXTAUTH_URL: 'http://127.0.0.1:4300',
  SECRET: 'local-e2e-only-not-a-production-secret',
  NEXTAUTH_SECRET: 'local-e2e-only-not-a-production-secret',
  FIREBASE_PROJECT_ID: project, GCLOUD_PROJECT: project,
  FIREBASE_API_KEY: 'fake-api-key', FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
  FIREBASE_STORAGE_BUCKET: `${project}.appspot.com`, FIREBASE_APP_ID: 'e2e-app',
  FIREBASE_MESSAGING_SENDER_ID: '123456', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:49099',
  OPENAI_API_KEY: 'e2e-unused-placeholder', FINE_TUNE_MODEL: 'e2e-unused',
});

function start(name, args, cwd = root) {
  const log = createWriteStream(`e2e/.runtime/${name}.log`, { flags: 'w' });
  const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  children.push(child);
  child.on('error', error => console.error(`${name}: ${error.message}`));
  return child;
}
async function waitFor(url, child, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`Service exited (${child.exitCode}); inspect e2e/.runtime logs.`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    // Infrastructure readiness polling, never a fixed browser-test delay.
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Service not ready: ${url}`);
}
async function assertFree(port) {
  const server = netServer();
  await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); });
  await new Promise(r => server.close(r));
}
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inContainer = process.env.E2E_IN_CONTAINER === '1';
let mongoStarted = false, mailbox;
function compose(...args) {
  const result = spawnSync('docker', ['compose', ...args], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Docker Compose failed. Start Docker Desktop and retry.');
}
let stopping;
async function cleanup() {
  if (stopping) return stopping;
  stopping = (async () => {
    for (const child of children.reverse()) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    }
    await Promise.all(children.map(child => child.exitCode !== null ? null : Promise.race([
      once(child, 'exit'), new Promise(r => setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} r(); }, 3000)),
    ])));
    if (mailbox) await new Promise(r => mailbox.close(r));
    if (mongoStarted) compose('stop', 'mongodb');
  })();
  return stopping;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await cleanup(); process.exit(130); });
try {
  for (const port of [4300, 4400, 4401, 49099, 49400, 49450]) await assertFree(port);
  if (!inContainer) {
    compose('up', '-d', '--wait', 'mongodb');
    mongoStarted = true;
  }
  env.MONGODB_URI = inContainer
    ? 'mongodb://mongodb:27017/careercompass_e2e'
    : 'mongodb://127.0.0.1:47017/careercompass_e2e';
  env.E2E_MONGO_URI = env.MONGODB_URI;
  env.E2E_MANAGED = '1';
  writeFileSync('e2e/.runtime/environment.json', JSON.stringify({ mongoURI: env.MONGODB_URI, project, authURL }));
  console.log('Production-mode tests: Docker MongoDB, Firebase Auth, NestJS build, Next.js build/start.');
  const auth = start('firebase', ['node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:start', '--only', 'auth', '--project', project, '--config', 'e2e/firebase.json']);
  await waitFor(`${authURL}/emulator/v1/projects/${project}/oobCodes`, auth);
  // Test-only viewer for REAL action links generated by the Auth emulator.
  // It is not an SMTP inbox and does not prove external email delivery.
  mailbox = httpServer(async (req, res) => {
    try {
      const email = new URL(req.url, 'http://127.0.0.1:4401').searchParams.get('email');
      const result = await fetch(`${authURL}/emulator/v1/projects/${project}/oobCodes`);
      if (!result.ok) throw new Error('Emulator unavailable');
      const { oobCodes = [] } = await result.json();
      const codes = oobCodes.filter(c => c.email === email && c.requestType === 'VERIFY_EMAIL');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`<html lang="sl"><title>Testni predal</title><h1>Testni predal: ${escape(email)}</h1><p>Lokalni pregled povezav Firebase emulatorja; brez dostave SMTP.</p>${codes.map(c => `<details><summary>Potrditev e-pošte za ${escape(email)}</summary><a href="${escape(c.oobLink)}">Potrdi e-poštni naslov</a></details>`).join('')}</html>`);
    } catch { res.writeHead(503); res.end('Emulator unavailable'); }
  });
  await new Promise(r => mailbox.listen(4401, '127.0.0.1', r));
  const build = start('backend-build', ['node_modules/@nestjs/cli/bin/nest.js', 'build'], resolve('backend'));
  const [buildCode] = await once(build, 'exit');
  if (buildCode !== 0) throw new Error('Backend build failed; see backend-build.log');
  const backend = start('backend', ['dist/main.js'], resolve('backend'));
  await waitFor('http://127.0.0.1:4400/company', backend);
  const prisma = start('prisma-generate', ['node_modules/prisma/build/index.js', 'generate'], resolve('frontend'));
  const [prismaCode] = await once(prisma, 'exit');
  if (prismaCode !== 0) throw new Error('Prisma generation failed; see prisma-generate.log');
  const frontendBuild = start('frontend-build', ['node_modules/next/dist/bin/next', 'build'], resolve('frontend'));
  const [frontendBuildCode] = await once(frontendBuild, 'exit');
  if (frontendBuildCode !== 0) throw new Error('Frontend production build failed; see frontend-build.log');
  const frontend = start('frontend', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '4300'], resolve('frontend'));
  await waitFor('http://127.0.0.1:4300', frontend);
  const tests = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { env, stdio: 'inherit', detached: true });
  children.push(tests);
  const [code] = await once(tests, 'exit');
  process.exitCode = code ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally { await cleanup(); }
