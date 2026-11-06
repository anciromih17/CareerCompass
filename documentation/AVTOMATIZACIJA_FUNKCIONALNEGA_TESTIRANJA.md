# 4. naloga – Avtomatizacija funkcionalnega testiranja

Projekt: **CareerCompass**, osebni repozitorij `anciromih17/CareerCompass`.  
Podlaga: [pet funkcionalnih testnih primerov](CareerCompass_funkcionalni_testni_primeri.md), TP-01–TP-05.  
Datum lokalne izvedbe: **6. 11. 2026**.  
Začetna različica: `680bf90`; dodana testna infrastruktura in konfiguracija spodaj.  
Avtor skript in osnutka poročila: **OpenAI Codex**. Človeški pregled skript in dopolnitve po 3. nalogi opravita avtorici pred oddajo; agent tega pregleda ne more potrditi v njunem imenu.

## 1. Izbira orodja

Uporabljen je **Playwright Test 1.65.0 s TypeScriptom**. Projekt ima frontend Next.js 14/React 18 in backend NestJS 10, oba v TypeScriptu. Playwright upravlja pravi brskalnik in tako preverja uporabniške postopke skozi frontend, API in shranjevanje. Obstoječi Jest testi zaledja ostajajo ločeni; sami ne nadomestijo teh petih brskalniških primerov.

Razlogi za izbiro:

- omogoča klike, vnos podatkov, navigacijo, delo z zavihki in preverjanje vidnega rezultata;
- izbira elementov po vlogi, napisu, oznaki polja ali stabilnem atributu in samodejno čakanje zmanjšata krhkost testov;
- `expect` ponovno preverja pogoj do časovne omejitve; v brskalniških testih ni fiksnih pavz;
- vsak test dobi nov brskalniški kontekst; fixture pripravi in odstrani lastne podatke;
- isti ukaz deluje lokalno in v GitHub Actions;
- vrne izhodno kodo, konzolni rezultat, HTML, JUnit XML in JSON; ob napaki še sled izvajanja (trace), video in zaslonsko sliko.

Viri: [namestitev](https://playwright.dev/docs/intro), [lokatorji](https://playwright.dev/docs/locators), [samodejno čakanje](https://playwright.dev/docs/actionability), [poročila](https://playwright.dev/docs/test-reporters), [GitHub Actions/CI](https://playwright.dev/docs/ci). Browser plugin v uporabljeni seji ni bil na voljo, zato so bili testi izvedeni neposredno s Playwrightom.

## 2. Namestitev in zagon

Orodja so nameščena v korenu repozitorija. Točne različice in tranzitivne odvisnosti določa `package-lock.json`. Dodatna orodja so Firebase CLI 15.35.0, MongoDB driver 7.8.0 in mongodb-memory-server 11.3.0. Slednji zažene **pravi začasni proces MongoDB 7.0.14**, ne ponarejenega odziva baze.

Za svežo kopijo projekta potrebuješ Node.js 22 ali novejši in dostop do spleta za namestitev paketov, Chromiuma ter prvo pridobitev MongoDB. CI uporablja Node.js 22 in Ubuntu 22.04. Lokalna izvedba je bila na macOS/Apple Silicon z Node.js 24.18.0.

V korenu projekta:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npx playwright install chromium
npm run test:e2e
```

Na Linuxu namesto zadnjega namestitvenega ukaza uporabi `npx playwright install --with-deps chromium`.

```bash
# Pregled petih testov brez izvajanja
npm run test:e2e:list

# Posamezen test, neodvisno od ostalih
npm run test:e2e -- --grep TP-03

# Odpri interaktivno poročilo zadnje izvedbe
npm run test:e2e:report
```

`npm run test:e2e` sam zažene storitve, zgradi backend, zažene frontend, izvede teste ter storitve ustavi. Ne zaganjaj sočasno dveh kopij testnega zaganjalnika. Če je kateri namenski port zaseden, se zaganjalnik ustavi in ne uporablja neznane obstoječe storitve.

## 3. Okolje, podatki in izolacija

| Sestavni del | Testna nastavitev |
| --- | --- |
| Brskalnik | Chromium, namizni prikaz 1440 × 1000 |
| Frontend | `http://127.0.0.1:4300`, Next.js razvojni strežnik |
| Backend | `http://127.0.0.1:4400`, zgrajen NestJS |
| MongoDB | začasen proces na naključnem lokalnem portu, baza `careercompass_e2e` |
| Firebase Auth | lokalni emulator `127.0.0.1:49099`, projekt `demo-careercompass-e2e` |
| Testni prikaz potrditvenih povezav | `http://127.0.0.1:4401`, samo med izvedbo |
| Firebase pomožna porta | 49400 in 49450 |
| Vzporednost / ponovitve | en worker, brez samodejnih ponovitev neuspešnih testov |

Zaganjalnik prepiše lokalne okoljske nastavitve za testne procese in uporabi izključno začasno bazo ter lažne konfiguracijske vrednosti za zunanje ponudnike. Obstoječih `.env` in `env` datotek ne spreminja in jih ne objavlja. Za ta sklop niso potrebni produkcijski Firebase, OpenAI, MongoDB ali GitHub Secrets. Chatbot in Google prijava nista predmet testiranja.

Vsak test začne s prazno testno bazo in praznim Auth emulatorjem, ustvari svoje predpogoje in konča s čiščenjem v `finally`, tudi ob neuspehu. Brisanje je dovoljeno samo ob označeni upravljani izvedbi in URI-ju `127.0.0.1` z namenskim imenom baze. Ohranitev testnih podatkov med testi ni potrebna. Preveri se tudi odsotnost uporabnikov in oglasov po čiščenju.

Testni naslovi imajo enoličen UUID in domeno `example.test`. To so naslovi za lokalni emulator, ne resnični zunanji predali. Gesli `Tst42!` in `Tst4!` sta izključno testni vrednosti iz izvirnega dokumenta.

TP-03 pripravi podjetja prek pravega API-ja in odda ocene prek API-ja. Ocena 3,9 nastane iz ene ocene 3 in devetih ocen 4; 4,1 iz ene ocene 5 in devetih ocen 4; 4,5 iz ocen 4 in 5; 4,0 iz ocene 4. Preverjene so povezane ocene, agregati in polje na podjetju. S tem se ne ponaredi zgolj številka, prikazana na kartici.

### Razlika pri potrditveni pošti TP-01

Firebase Auth emulator ne pošilja dejanske e-pošte. Shranjuje potrditvene povezave, ki jih aplikacija ustvari s klicem `sendEmailVerification`. Testni predal je majhen lokalni pregledovalnik **teh dejansko ustvarjenih povezav**, ne ponarejen odgovor aplikacijskega API-ja.

Test odpre drug zavihek, prikaže sporočilo za uporabljeni naslov, klikne povezavo, preveri potrjeno stanje v Auth in se nato prijavi prek aplikacije. **Ne preverja dostave SMTP, Gmailovega vmesnika ali produkcijskega pošiljatelja `noreply@career-compass-ed243.firebaseapp.com`.** To je izrecna prilagoditev korakov 4–6 za ponovljiv CI. Za popolno pokritost izvirnega testa bi bila potrebna dodatna izvedba z namenskim resničnim Firebase projektom in dostopnim testnim predalom. Uspeh emulatorjevega testa ni dokaz dostave zunanje pošte.

Vir: [Firebase – Authentication emulator](https://firebase.google.com/docs/emulator-suite/connect_auth).

## 4. Sledljivost in pregled skript

Vseh pet testov je v [`e2e/tests/functional.spec.ts`](../e2e/tests/functional.spec.ts). Skupna priprava, prijava in čiščenje so v [`e2e/fixtures.ts`](../e2e/fixtures.ts). Oštevilčeni `test.step` bloki se ujemajo s koraki izvirnega dokumenta.

| Primer / funkcionalnost | Predpogoji in podatki | Avtomatizirani koraki in preverjanja | Omejitev / prilagoditev |
| --- | --- | --- | --- |
| TP-01 / F1, US1 | nov naslov, Testna Oseba, geslo 6 znakov, neprijavljen brskalnik | 1–2: registracija iz noge, pravilni vnosi in prikrito geslo; 3: obvestilo, preusmeritev, en račun v obeh shrambah; 4–6: nov zavihek in potrditev dejanske povezave; 7–8: prijava in ohranitev po osvežitvi; odjava in odstranitev računa | lokalni pregled povezav nadomesti zunanji poštni predal; zunanja dostava ni pokrita |
| TP-02 / F1, US1 | lasten nov naslov, Testna Oseba, geslo 5 znakov | 1–2: isti uporabniški vstop in veljavni ostali podatki; 3–4: zahtevano sporočilo, HTTP 400, brez uspešnega obvestila in brez prijave; 5: nič računov v obeh shrambah in nič potrditvenih povezav | brez odvisnosti od TP-01 |
| TP-03 / F4, US2 | samo A–D, dejavnosti in ocene iz dokumenta, skladne povezane ocene | 1: vsi štirje začetni zadetki; 2–3: izbrana filtra in odsotnost drugih omejitev; 4–5: natanko A in D, dejavnost in prikazani oceni 4 ter 4,1; B in C izločena | priprava in odstranitev izoliranih podatkov sta avtomatizirani |
| TP-04 / F8, US4 | neodvisen potrjen račun, kontrolni oglas TP04 Razvijalec | 1–2: navigacija in prisoten kontrolni oglas; 3–4: vnos TP04BREZZADETKOV, uspešen API odziv, nič kartic in »Ni rezultatov.«; 5: ponastavitev znova pokaže oglas, seja ostane aktivna; odjava | v majhnem izoliranem naboru straničenje ni potrebno |
| TP-05 / F15, US8 | lastno podjetje in račun, en obstoječi oglas (N = 1), novi naziv še ne obstaja | 1–2: profil in obrazec; 3–4: vsa štiri polja, en klik, preusmeritev, takojšnji prikaz enega oglasa; 5: vse podrobnosti in podjetje; 6: ponovno odprtje, osvežitev, N + 1, en zapis in pravilni podatki v bazi; odstranitev po ID in povrnitev na N | BUG-01 krši korak 4; dodatna osvežitev je samo označena diagnostika, rezultat testa ostane neuspešen |

Robustnost:

- vloga in naziv elementa, oznake polj ter placeholderji imajo prednost pred strukturnimi CSS selektorji;
- povezava za registracijo je omejena na nogo in `/registracija`, saj obstaja tudi registracija podjetja;
- neoznačena izbirna seznama sta izbrana s stabilnim atributom `name` znotraj ustreznega filtra;
- čakanje temelji na vidnosti, URL-ju, API odzivu ali pogoju `expect.poll`, ne na `waitForTimeout`;
- testi preverjajo vsebino, natančno število in shranjene podatke, ne zgolj naložene strani;
- browser exceptions in lokalni HTTP 5xx povzročijo napako; konzolna opozorila so priložena poročilu;
- noben test ne potrebuje rezultata drugega. En worker prepreči tekmovanje pri ponastavljanju iste namenske baze;
- neuspeh TP-05 ni označen kot pričakovan z `test.fail`, preskočen ali skrit z `continue-on-error`.

### Kontrolni seznam za človeški pregled pred oddajo

- [ ] Primerjaj vseh pet `test.step` potekov s popravki iz 3. naloge.
- [ ] Potrdi testne podatke in pričakovane rezultate v zgornji matriki.
- [ ] Preglej in pojasni razliko med emulatorjem in dejanskim e-poštnim predalom.
- [ ] Samostojno zaženi en test in nato celoten sklop.
- [ ] Odpri poročilo, preveri BUG-01 in pojasni, zakaj neuspešen test ni nujno napačna skripta.
- [ ] Dopolni poročilo z imenoma avtoric ter datumom vajinega pregleda.

## 5. Vključitev v cevovod

V obstoječem `.github/workflows/workflow.yml` je dodan job **`functional_testing` / Functional tests (Playwright)**. Sproži se ob pushu na `main`, pull requestu na `main` ali ročno z Run workflow v zavihku Actions.

Postopek: checkout → Node.js 22 → `npm ci` za testna orodja, backend in frontend → namestitev Chromiuma z OS odvisnostmi → `npm run test:e2e` → nalaganje artefakta `functional-test-results` tudi ob neuspehu. Rok izvajanja je 20 minut, artefakti ostanejo 14 dni. Job za funkcionalne teste je neodvisen od starejših build/unit/SonarCloud opravil.

Neuspešen test vrne neničelno izhodno kodo in označi job kot neuspešen. To je pravilen rezultat ob zaznani napaki aplikacije. V artefaktu so HTML, JSON, JUnit, video/sledi/slike neuspehov in dnevniški izpisi testnih storitev. Lokalne env datoteke niso del artefakta.

Obstoječi SonarCloud job še vedno vsebuje prvotno organizacijo `mtoplak` in pričakuje njene nastavitve. Stara build opravila prav tako niso enaka novemu izoliranemu funkcionalnemu jobu. Že [izvedba pred dodajanjem avtomatizacije](https://github.com/anciromih17/CareerCompass/actions/runs/42271949942) je imela neuspešen Build frontend, uspešna Build backend in Backend unit testing ter preskočen SonarCloud. Njihov uspeh se ne sme enačiti z uspehom teh petih testov; njihova migracija ni bila predmet te naloge.

## 6. Rezultati lokalnega testiranja

**Rezultat: 4 uspešni, 1 neuspešen test.** Končni celoten lokalni zagon je trajal 46,1 sekunde (brez priprave storitev). [Strojni povzetek](evidence/local-results.json). Noben test ni preskočen. TP-01 je uspešen v dokumentirani emulatorjevi različici. Rezultat ne pomeni, da so bile preizkušene vse funkcionalnosti projekta.

| Test | Rezultat | Ugotovitev |
| --- | --- | --- |
| TP-01 | Uspešen v emulatorju | račun nastane, povezava potrdi e-pošto, prijava in osvežitev ohranita sejo |
| TP-02 | Uspešen | petmestno geslo je zavrnjeno, račun ne nastane v nobeni shrambi |
| TP-03 | Uspešen | po kombiniranju filtrov ostaneta natanko TP03-A in TP03-D |
| TP-04 | Uspešen | prazno stanje je pravilno, ponastavitev vrne kontrolni oglas |
| TP-05 | Neuspešen – BUG-01 | po preusmeritvi novi oglas manjka na profilu; dodatna osvežitev je diagnostičen korak |

Strojno poročilo zadnjega zagona: `test-results/results.json`, `test-results/junit.xml` in `playwright-report/index.html`. Ukaz `npm run test:e2e:report` odpre podrobnosti, korake in priponke. Te mape so generirani lokalni rezultati in niso v Gitu; v CI so objavljene kot artefakt. Trajni povzetek in dokazi so v tem dokumentu in mapi `documentation/evidence`.

### BUG-01 – Profil po objavi ne prikaže novega oglasa

- **Predpogoj:** prijavljeno podjetje TP05 Podjetje z enim obstoječim oglasom.
- **Ponovitev:** profil podjetja → Dodaj zaposlitev → veljavni podatki iz TP-05 → en klik Dodaj oglas.
- **Pričakovano:** preusmeritev na profil, kjer je TP05 Razvijalec viden natanko enkrat, skupaj N + 1 oglasov.
- **Dejansko:** po preusmeritvi je še vedno prikazan prejšnji seznam brez novega oglasa. Čakanje do 15 sekund ne spremeni prikaza.
- **Vpliv:** uporabnik ne vidi rezultata uspešne objave in bi lahko oglas oddal znova.
- **Diagnostika:** skripta po neuspešnem preverjanju shrani stanje strani in baze, nato dodatno osveži stran. V bazi je en pravilno povezan oglas; po osvežitvi je viden. Podrobnosti, ponoven obisk profila, skupno število N + 1 in odstranitev po ID nato prestanejo preverjanje. To ne spremeni rezultata testa v uspeh; nadaljnji koraki so preverjeni z dodatnim diagnostičnim posegom.
- **Verjeten vzrok (sklep iz kode):** po `router.push` na že obiskani profil Next.js ponovno uporabi predpomnjeni prikaz; obrazec ne zahteva osvežitve podatkov profila. To ni dokončna analiza vseh možnih vzrokov.
- **Predlog popravka:** po uspešni objavi ustrezno osvežiti/razveljaviti podatke profila ter ponovno izvesti nespremenjeno pričakovanje koraka 4.
- **Dokazi:** [pred osvežitvijo](evidence/BUG-01-before-refresh.png), [po osvežitvi](evidence/BUG-01-after-refresh.png), [shranjeni oglas](evidence/BUG-01-database.json).
- **Stanje:** odprto. Poslovne logike objave nismo spreminjali zgolj zato, da bi test postal zelen.

Dodatno preverjanje: TypeScript za backend in nove testne skripte brez napak; obstoječi Jest sklop ima **12 uspešnih testov v 2 zbirkah**. Ti testi niso del zgornjih petih funkcionalnih primerov.

## 7. Pregled in popravki ustvarjenih skript

Prvi razvojni zagon je pokazal dvoumno povezavo »Registracija« in napačno velikost začetnic pri testni pripravi ocen. To sta bili napaki skript: lokator je bil omejen na uporabniško registracijo, priprava pa popravljena na veljavni vrednosti `Pozitivna` in `Enostavno` iz kode. Za neodvisen hladen zagon prijava najprej počaka na dejanski odgovor inicializacije seje (brez časovne pavze). Popravljeno je bilo tudi čakanje na končano navigacijo nazaj na profil pred osvežitvijo; sicer bi test lahko osvežil še prejšnjo stran. Po popravkih so TP-01–TP-04 uspešni; napaka TP-05 se je ponovila.

Pri TP-05 je bilo dodano mehko preverjanje (`expect.soft`) zgolj za zbiranje nadaljnjih dokazov. Morebitna dodatna osvežitev je jasno označena kot diagnostika izven izvirnega poteka; prvotni neuspeh ostane v poročilu in izhodni kodi.

Spremembe aplikacije so omejene na nastavitve testiranja: možnost izrecnega API URL-ja, varovano povezovanje z lokalnim Firebase Auth emulatorjem in ločen Next.js imenik `.next-e2e`. Običajna lokalna/produkcijska povezava Firebase ostane privzeta, kadar emulator ni nastavljen. V `backend/tsconfig.json` sta izrecno vključena tipa `node` in `jest`, da urejevalnik prepozna `describe`, `beforeEach` in druge globale obstoječih Jest testov. Funkcionalni popravki aplikacije niso del teh sprememb.

## 8. Omejitve in uporaba UI

Izveden je Chromium na namiznem prikazu, ne Firefox, WebKit ali mobilne naprave. Frontend v tem sklopu teče v razvojnem načinu; to ni preverjanje produkcijske gradnje ali gostovanja. Testi ne dokazujejo varnosti API-ja, zmogljivosti, dejanske dostave e-pošte ali pravilnosti vseh funkcionalnosti. Pri TP-05 se koraki po dodatni diagnostični osvežitvi ne štejejo za uspešen nespremenjen izvirni potek.

**Generativno orodje:** OpenAI Codex, agent v namizni aplikaciji, je pregledal dokumentacijo in kodo, pripravil testne skripte, konfiguracijo ter osnutek poročila in lokalno izvedel teste. Drugi agenti niso bili uporabljeni. Pregled avtoric je ločen korak po navodilu naloge in ga je treba še evidentirati.
