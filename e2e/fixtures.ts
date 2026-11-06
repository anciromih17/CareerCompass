import { test as base, expect, type Page } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';

export const backend = 'http://127.0.0.1:4400';
export const authURL = 'http://127.0.0.1:49099';
export const project = 'demo-careercompass-e2e';
export const password = 'Tst42!';

async function json(url: string, body?: object, method = 'POST') {
  const response = await fetch(url, { method: body ? method : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${await response.text()}`);
  return response.json();
}
export async function authAccounts() {
  const data = await json(`${authURL}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:query`, {});
  return data.userInfo ?? [];
}
export async function verificationCodes(email: string) {
  const data = await json(`${authURL}/emulator/v1/projects/${project}/oobCodes`);
  return (data.oobCodes ?? []).filter((code: any) => code.email === email && code.requestType === 'VERIFY_EMAIL');
}
export async function signIn(page: Page, email: string, name: string) {
  const initialSession = page.waitForResponse(response => response.url().endsWith('/api/auth/session'));
  await page.goto('/prijava');
  await (await initialSession).finished();
  await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.getByPlaceholder('Geslo', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Prijava', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4300/');
  await expect(page.locator('header').getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Odjava', exact: true })).toBeVisible();
}
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Odjava', exact: true }).click();
  await expect(page.locator('header').getByRole('link', { name: 'Prijava', exact: true })).toBeVisible();
}
export async function openRegistration(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Career Compass/);
  const footer = page.locator('footer');
  await expect(footer.getByText('Moj račun', { exact: true })).toBeVisible();
  await footer.getByRole('link', { name: 'Registracija', exact: true }).and(footer.locator('a[href="/registracija"]')).click();
  await expect(page).toHaveURL(/\/registracija$/);
  await expect(page.getByRole('heading', { name: 'Registracija', exact: true })).toBeVisible();
}
export async function fillRegistration(page: Page, email: string, pass: string) {
  await page.getByPlaceholder('Ime in priimek', { exact: true }).fill('Testna Oseba');
  await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.getByPlaceholder('Geslo', { exact: true }).fill(pass);
  await expect(page.getByPlaceholder('Ime in priimek', { exact: true })).toHaveValue('Testna Oseba');
  await expect(page.getByPlaceholder('Email', { exact: true })).toHaveValue(email);
  await expect(page.getByPlaceholder('Geslo', { exact: true })).toHaveValue(pass);
  await expect(page.getByPlaceholder('Geslo', { exact: true })).toHaveAttribute('type', 'password');
}

type World = {
  db: ReturnType<MongoClient['db']>;
  email: string;
  company: (name: string, industry?: string) => Promise<any>;
  account: (name: string, companyId?: string) => Promise<string>;
  job: (company: any, position: string) => Promise<any>;
  rate: (company: any, scores: number[]) => Promise<void>;
};
export const test = base.extend<{ world: World }>({
  world: async ({ page }, use, testInfo) => {
    const uri = process.env.E2E_MONGO_URI;
    if (process.env.E2E_MANAGED !== '1' || !['mongodb://127.0.0.1:47017/careercompass_e2e', ...(process.env.E2E_IN_CONTAINER === '1' ? ['mongodb://mongodb:27017/careercompass_e2e'] : [])].includes(uri ?? '')) {
      throw new Error('Run npm run test:e2e; refusing to reset an unmanaged database.');
    }
    const client = await MongoClient.connect(uri);
    const db = client.db('careercompass_e2e');
    const reset = async () => {
      await db.dropDatabase();
      const response = await fetch(`${authURL}/emulator/v1/projects/${project}/accounts`, { method: 'DELETE' });
      expect(response.ok, 'Auth emulator reset succeeded').toBeTruthy();
    };
    await reset();
    const errors: string[] = [], consoleMessages: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500 && /127\.0\.0\.1/.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
    const email = `tp-${randomUUID()}@example.test`;
    const company = async (name: string, industry = 'Dom in vrt') => json(`${backend}/company`, {
      name, industry: [industry], subindustry: ['Testna dejavnost'], address: 'Testna ulica 1',
      city: 'Maribor', logo: '/images/logo/logocompass.png', email: `${name.toLowerCase().replace(/\s/g, '-')}@example.test`,
    });
    const account = async (name: string, companyId?: string) => {
      const user = await json(`${authURL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, { email, password, returnSecureToken: true });
      await json(`${authURL}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:update`, { localId: user.localId, emailVerified: true });
      await db.collection('users').insertOne({ name, email, company: companyId ? new ObjectId(companyId) : null, saved_advertisements: [] });
      return email;
    };
    const job = (company: any, position: string) => json(`${backend}/job`, {
      position, company: company.name, company_linked: company.id, description: 'Kontrolni testni oglas.',
      application: 'Testna prijava.', city: 'Maribor', source: 'Career Compass', url: `/podjetje/${company.slug}`,
    });
    const rate = async (company: any, scores: number[]) => {
      for (const score of scores) {
        await json(`${backend}/rating`, {
          company_slug: company.slug, team: score, personal_development: score, flexibility: score,
          work_life_balance: score, work_environment: score, leadership: score, benefits: score,
          bonuses: score, remote_work: true, experience: 'Pozitivna', difficulty: 'Enostavno',
        });
      }
      const average = scores.reduce((sum, n) => sum + n, 0) / scores.length;
      await expect.poll(async () => (await db.collection('companies').findOne({ _id: new ObjectId(company.id) }))?.average).toBeCloseTo(average, 6);
      const aggregate = await db.collection('averageratings').findOne({ company: new ObjectId(company.id) });
      expect(aggregate?.avg_rating).toBeCloseTo(average, 6);
      expect(aggregate?.ratings_count).toBe(scores.length);
      expect(await db.collection('ratings').countDocuments({ company_slug: company.slug })).toBe(scores.length);
    };
    try {
      await testInfo.attach('test-data', { body: JSON.stringify({ email, password, project }), contentType: 'application/json' });
      await use({ db, email, company, account, job, rate });
      expect(errors, 'No browser exceptions or local HTTP 5xx responses').toEqual([]);
      await testInfo.attach('final-screen', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    } finally {
      await testInfo.attach('browser-console', { body: JSON.stringify({ errors, consoleMessages }, null, 2), contentType: 'application/json' });
      await reset();
      expect(await db.collection('users').countDocuments()).toBe(0);
      expect(await db.collection('jobadvertisements').countDocuments()).toBe(0);
      expect(await authAccounts()).toHaveLength(0);
      await client.close();
    }
  },
});
export { expect };
