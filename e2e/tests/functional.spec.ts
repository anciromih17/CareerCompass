import { test, expect, openRegistration, fillRegistration, signIn, signOut, authAccounts, verificationCodes, password } from '../fixtures';
import { ObjectId } from 'mongodb';

test('TP-01 – Registracija, potrditev e-pošte in trajna prijava', async ({ page, context, world }) => {
  await test.step('Predpogoji: naslov ne obstaja v nobeni shrambi', async () => {
    expect(await world.db.collection('users').findOne({ email: world.email })).toBeNull();
    expect((await authAccounts()).filter((u: any) => u.email === world.email)).toHaveLength(0);
  });
  await test.step('1–2: Registracija iz noge strani in šestmestno prikrito geslo', async () => {
    await openRegistration(page);
    await fillRegistration(page, world.email, password);
  });
  await test.step('3: Oddaja, uspešno obvestilo in preusmeritev na prijavo', async () => {
    await page.getByRole('button', { name: 'Registracija', exact: true }).click();
    await expect(page.getByText('Uspešna registracija! Na izbran email ste prejeli potrditveno povezavo.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/prijava$/);
    expect(await world.db.collection('users').countDocuments({ email: world.email })).toBe(1);
    const users = (await authAccounts()).filter((u: any) => u.email === world.email);
    expect(users).toHaveLength(1);
    expect(users[0].emailVerified ?? false).toBe(false);
  });
  await test.step('4–6: Nov zavihek, testni predal emulatorja in dejanska potrditvena povezava', async () => {
    // Explicit adaptation: Auth emulator captures links; real SMTP delivery is not tested.
    await expect.poll(async () => (await verificationCodes(world.email)).length).toBe(1);
    const mail = await context.newPage();
    await mail.goto(`http://127.0.0.1:4401/?email=${encodeURIComponent(world.email)}`);
    await expect(mail.getByRole('heading', { name: `Testni predal: ${world.email}` })).toBeVisible();
    await mail.getByText(`Potrditev e-pošte za ${world.email}`, { exact: true }).click();
    await mail.getByRole('link', { name: 'Potrdi e-poštni naslov', exact: true }).click();
    await expect(mail).toHaveURL(/127\.0\.0\.1:49099.*mode=verifyEmail/);
    await expect(mail.getByText(/verified|potrjen/i)).toBeVisible();
    await expect.poll(async () => (await authAccounts()).find((u: any) => u.email === world.email)?.emailVerified).toBe(true);
    await mail.close();
    await page.bringToFront();
  });
  await test.step('7–8: Prijava potrjenega računa in ohranitev seje po osvežitvi', async () => {
    await expect(page).toHaveURL(/\/prijava$/);
    await signIn(page, world.email, 'Testna Oseba');
    await page.reload();
    await expect(page.locator('header').getByText('Testna Oseba', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odjava', exact: true })).toBeVisible();
  });
  await test.step('Čiščenje: odjava; fixture odstrani račun iz obeh shramb', async () => { await signOut(page); });
});

test('TP-02 – Zavrnitev petmestnega gesla brez ustvarjenega računa', async ({ page, world }) => {
  await test.step('Predpogoji: neprijavljen uporabnik in nov naslov', async () => {
    expect(await world.db.collection('users').findOne({ email: world.email })).toBeNull();
    expect((await authAccounts()).filter((u: any) => u.email === world.email)).toHaveLength(0);
  });
  await test.step('1–2: Odpri obrazec in vnesi petmestno geslo', async () => {
    await openRegistration(page);
    await fillRegistration(page, world.email, 'Tst4!');
  });
  await test.step('3–4: Zavrnitev, obrazec ostane odprt, uporabnik ni prijavljen', async () => {
    const response = page.waitForResponse(r => r.url().endsWith('/api/register') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Registracija', exact: true }).click();
    expect((await response).status()).toBe(400);
    await expect(page.getByText(/Geslo mora vsebovati vsaj 6 znakov!/)).toBeVisible();
    await expect(page).toHaveURL(/\/registracija$/);
    await expect(page.getByText(/Uspešna registracija!/)).toHaveCount(0);
    await expect(page.locator('header').getByRole('link', { name: 'Prijava', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odjava', exact: true })).toHaveCount(0);
  });
  await test.step('5: Račun ne obstaja v MongoDB ali Firebase Auth', async () => {
    expect(await world.db.collection('users').countDocuments({ email: world.email })).toBe(0);
    expect((await authAccounts()).filter((u: any) => u.email === world.email)).toHaveLength(0);
    expect(await verificationCodes(world.email)).toHaveLength(0);
  });
  await page.goto('/');
});

test('TP-03 – Kombinacija dejavnosti in vključujoče meje ocene 4', async ({ page, world }) => {
  await test.step('Predpogoji: štiri podjetja ter skladne ocene in agregati', async () => {
    for (const [name, industry, scores] of [
      ['TP03-A', 'Dom in vrt', [4]],
      ['TP03-B', 'Dom in vrt', [3, ...Array(9).fill(4)]],
      ['TP03-C', 'Avtomobilizem', [4, 5]],
      ['TP03-D', 'Dom in vrt', [5, ...Array(9).fill(4)]],
    ] as [string, string, number[]][]) {
      const company = await world.company(name, industry);
      await world.rate(company, scores);
    }
    expect(await world.db.collection('companies').countDocuments()).toBe(4);
  });
  await test.step('1: Navigacija Podjetja in začetni prikaz A–D', async () => {
    await page.goto('/');
    await page.locator('header').getByRole('link', { name: 'Podjetja', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vsa podjetja', exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/podjetje/"]').filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(4);
    for (const name of ['TP03-A', 'TP03-B', 'TP03-C', 'TP03-D']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  });
  await test.step('2–3: Izberi Dom in vrt ter 4+, brez drugih omejitev', async () => {
    const filter = page.locator('#company-filter');
    await filter.locator('select[name="dejavnost"]').selectOption({ label: 'Dom in vrt' });
    await filter.locator('select[name="ocena"]').selectOption({ label: '4+' });
    await expect(filter.locator('select[name="dejavnost"]')).toHaveValue('Dom in vrt');
    await expect(filter.locator('select[name="ocena"]')).toHaveValue('4+');
    await expect(filter.getByPlaceholder('Vnesi ime')).toBeEmpty();
    await expect(filter.getByPlaceholder('Vnesi lokacijo')).toBeEmpty();
    await expect(filter.getByRole('checkbox', { name: 'Zaposlitveni oglasi' })).not.toBeChecked();
    await filter.getByRole('button', { name: /Išči/ }).click();
  });
  await test.step('4–5: Natanko A in D, prava dejavnost in prikazani oceni', async () => {
    await expect(page).toHaveURL(/\/iskanje\?/);
    const cards = page.locator('a[href^="/podjetje/"]').filter({ has: page.getByRole('heading', { level: 3 }) });
    await expect(cards).toHaveCount(2);
    for (const [name, rating] of [['TP03-A', '(4)'], ['TP03-D', '(4.1)']]) {
      const card = cards.filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.getByText('Dom in vrt', { exact: true })).toBeVisible();
      await expect(card.getByText(rating, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'TP03-B', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'TP03-C', exact: true })).toHaveCount(0);
    expect(await world.db.collection('companies').countDocuments()).toBe(4);
  });
});

test('TP-04 – Prazni zadetki in ponastavitev iskanja zaposlitve', async ({ page, world }) => {
  const company = await world.company('TP04 Podjetje');
  await world.job(company, 'TP04 Razvijalec');
  await world.account('TP04 Uporabnik');
  await signIn(page, world.email, 'TP04 Uporabnik');
  await test.step('1–2: Odpri Zaposlitve in preveri kontrolni oglas', async () => {
    await page.locator('header').getByRole('link', { name: 'Zaposlitve', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vsi zaposlitveni oglasi', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'TP04 Razvijalec', exact: true })).toBeVisible();
  });
  await test.step('3–4: Veljavna poizvedba brez zadetkov', async () => {
    const filter = page.locator('#job-filter');
    await filter.getByPlaceholder('Vnesi delovno mesto').fill('TP04BREZZADETKOV');
    await expect(filter.getByPlaceholder('Vnesi delovno mesto')).toHaveValue('TP04BREZZADETKOV');
    await expect(filter.getByPlaceholder('Vnesi lokacijo')).toBeEmpty();
    await expect(filter.locator('select[name="dejavnost"]')).toHaveValue('');
    const response = page.waitForResponse(r => r.url().includes('/job/search?position=TP04BREZZADETKOV'));
    await filter.getByRole('button', { name: /Išči/ }).click();
    expect((await response).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Ni rezultatov.', exact: true })).toBeVisible();
    await expect(page.locator('a[href^="/zaposlitev/"]')).toHaveCount(0);
  });
  await test.step('5: Ponastavitev vrne obstoječi oglas in ohrani sejo', async () => {
    const filter = page.locator('#job-filter');
    await filter.getByPlaceholder('Vnesi delovno mesto').fill('');
    await filter.getByRole('button', { name: /Išči/ }).click();
    await expect(page.getByRole('heading', { name: 'TP04 Razvijalec', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ni rezultatov.', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Odjava', exact: true })).toBeVisible();
    expect(await world.db.collection('jobadvertisements').countDocuments()).toBe(1);
  });
  await signOut(page);
});

test('TP-05 – Objava enega oglasa, pravilne podrobnosti in trajnost', async ({ page, world }) => {
  const company = await world.company('TP05 Podjetje');
  await world.account('TP05 Podjetje', company.id);
  await world.job(company, 'TP05 Obstoječi oglas');
  const query = { company_linked: new ObjectId(company.id) };
  const initialCount = await world.db.collection('jobadvertisements').countDocuments(query);
  expect(await world.db.collection('jobadvertisements').countDocuments({ position: 'TP05 Razvijalec' })).toBe(0);
  await signIn(page, world.email, 'TP05 Podjetje');
  await test.step('1–2: Profil podjetja in Dodaj zaposlitev', async () => {
    await page.locator('header').getByRole('link', { name: 'TP05 Podjetje', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'TP05 Podjetje', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Dodaj zaposlitev', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dodaj zaposlitveni oglas', exact: true })).toBeVisible();
  });
  const values = {
    'Naziv:': 'TP05 Razvijalec',
    'Opis delovnega mesta:': 'Razvoj in vzdrževanje testne spletne aplikacije.',
    'Opis postopka prijave na zaposlitev:': 'Pošljite življenjepis prek kontaktnega obrazca testnega podjetja.',
    'Lokacija:': 'Maribor',
  };
  await test.step('3–4: Izpolni vsa polja, enkrat oddaj in preveri en oglas', async () => {
    for (const [label, value] of Object.entries(values)) {
      await page.getByLabel(label, { exact: true }).fill(value);
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    }
    await page.getByRole('button', { name: 'Dodaj oglas', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/podjetje/${company.slug}$`));
    const createdHeading = page.getByRole('heading', { name: 'TP05 Razvijalec', exact: true });
    await expect.soft(createdHeading, 'BUG-01: novi oglas mora biti viden takoj po oddaji').toHaveCount(1);
    if (await createdHeading.count() !== 1) {
      await test.step('Diagnostika BUG-01: dodatna osvežitev; test ostane neuspešen', async () => {
        await test.info().attach('BUG-01-before-refresh', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        const stored = await world.db.collection('jobadvertisements').find({ ...query, position: 'TP05 Razvijalec' }).toArray();
        await test.info().attach('BUG-01-database', { body: JSON.stringify(stored, null, 2), contentType: 'application/json' });
        expect(stored).toHaveLength(1);
        await page.reload();
        await expect(createdHeading).toHaveCount(1);
        await test.info().attach('BUG-01-after-refresh', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    }
  });
  await test.step('5: Odpri oglas in preveri vse podatke ter povezano podjetje', async () => {
    await page.getByRole('heading', { name: 'TP05 Razvijalec', exact: true }).click();
    await expect(page).toHaveURL(/\/zaposlitev\/[a-f0-9]+$/);
    await expect(page.getByRole('heading', { name: values['Naziv:'], exact: true })).toBeVisible();
    await expect(page.getByText(values['Opis delovnega mesta:'], { exact: true })).toBeVisible();
    await expect(page.getByText(values['Opis postopka prijave na zaposlitev:'], { exact: true })).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^Lokacija:\s*Maribor$/ })).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^Podjetje:/ }).getByRole('link', { name: 'TP05 Podjetje' })).toHaveAttribute('href', `/podjetje/${company.slug}`);
  });
  await test.step('6: Ponoven profil in osvežitev ohranita natanko N + 1 oglasov', async () => {
    await page.locator('header').getByRole('link', { name: 'TP05 Podjetje', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/podjetje/${company.slug}$`));
    await expect(page.getByRole('heading', { name: 'TP05 Podjetje', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'TP05 Razvijalec', exact: true })).toHaveCount(1);
    await expect(page.locator('a[href^="/zaposlitev/"]')).toHaveCount(initialCount + 1);
    const records = await world.db.collection('jobadvertisements').find({ ...query, position: 'TP05 Razvijalec' }).toArray();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ company: 'TP05 Podjetje', city: 'Maribor', description: values['Opis delovnega mesta:'], application: values['Opis postopka prijave na zaposlitev:'] });
    expect(await world.db.collection('jobadvertisements').countDocuments(query)).toBe(initialCount + 1);
  });
  await test.step('Čiščenje: odstrani novi oglas po ID, preveri N in se odjavi', async () => {
    const created = await world.db.collection('jobadvertisements').findOne({ ...query, position: 'TP05 Razvijalec' });
    expect(created).not.toBeNull();
    await world.db.collection('jobadvertisements').deleteOne({ _id: created!._id });
    expect(await world.db.collection('jobadvertisements').countDocuments(query)).toBe(initialCount);
    await signOut(page);
  });
});
