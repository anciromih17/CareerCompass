# 4. naloga – Avtomatizacija funkcionalnega testiranja

Projekt: CareerCompass (`anciromih17/CareerCompass`). Datum: 6. 11. 2026.
Podlaga: [pet funkcionalnih testnih primerov TP-01–TP-05](CareerCompass_funkcionalni_testni_primeri.md).
Skripte, infrastrukturo in osnutek poročila je pripravil OpenAI Codex. Pregled avtoric pred oddajo je treba evidentirati ločeno.

## 1. Orodje in rezultati

Uporabljen je Playwright Test 1.65.0 s TypeScriptom in Chromiumom. Projekt uporablja Next.js 14/React 18 ter NestJS 10; Playwright preverja postopke skozi brskalnik, pravi API in MongoDB. Primeren je zaradi semantičnih lokatorjev, samodejnega čakanja, izoliranih brskalniških kontekstov in povezave z GitHub Actions. Izhodi so konzola/izhodna koda, HTML, JUnit XML, JSON ter slike, video in trace ob neuspehu. Odvisnosti so zaklenjene v package-lock.json.

Viri: [Playwright CI](https://playwright.dev/docs/ci), [lokatorji](https://playwright.dev/docs/locators), [poročila](https://playwright.dev/docs/test-reporters), [Next.js produkcijski zagon](https://nextjs.org/docs/14/pages/building-your-application/deploying), [Docker healthchecks](https://docs.docker.com/compose/how-tos/startup-order/).

## 2. Lokalno okolje s produkcijsko gradnjo

Frontend se pred testi zgradi z **next build** in zažene z **next start**, NODE_ENV=production. Backend se zgradi in zažene kot `node dist/main.js`. To je lokalno preverjanje produkcijske gradnje, ne objava spletnega mesta v javnost.

MongoDB 7.0.14 teče v Dockerju, konfiguracija je v `compose.yaml`. Ima healthcheck in podatkovni volumen `careercompass-testing_mongo-data`. Testna baza se imenuje `careercompass_e2e`. mongodb-memory-server je odstranjen.

| Storitev | Naslov |
| --- | --- |
| Frontend next start | http://127.0.0.1:4300 |
| Backend | http://127.0.0.1:4400 |
| MongoDB iz gostiteljskega računalnika | mongodb://127.0.0.1:47017/careercompass_e2e |
| MongoDB znotraj Compose omrežja | mongodb://mongodb:27017/careercompass_e2e |
| Firebase Auth emulator | 127.0.0.1:49099, projekt demo-careercompass-e2e |
| Lokalni pregled potrditvenih povezav | http://127.0.0.1:4401 |
| Pomožna porta emulatorja | 49400, 49450 |

Potrebuješ Docker Desktop. Za izvajanje na gostitelju tudi Node.js 22+ (lokalno preverjeno z 24.18.0); Docker slika uporablja Node.js 22. Chromium je namizni, 1440 × 1000. Browser plugin ni na voljo, zato je uporabljen neposredni Playwright.

### Zagon na računalniku, baza v Dockerju

V korenu repozitorija:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npx playwright install chromium
npm run test:e2e
```

Zaganjalnik počaka na zdrav MongoDB, zažene Auth emulator, zgradi backend, generira Prisma odjemalca, zgradi frontend, zažene next start in izvede teste. Po izvedbi ustavi storitve in MongoDB; volumen ohrani. Lokalnih env datotek ne spreminja. Next.js gradnja ima ločen imenik `.next-e2e` in omejitev dveh gradilnih workerjev samo za to okolje.

Prisma generiranje je potrebno zaradi obstoječih modulov za ponastavitev gesla. Ti niso predmet petih testov; PostgreSQL baza se za te teste ne zaganja. Pri namestitvi morajo biti omogočene običajne namestitvene skripte odvisnosti frontenda, zlasti bcrypt. Manjkajoče nativne vezave lahko popravi `npm rebuild bcrypt --prefix frontend`; pri npm, ki zahteva odobritev skript, najprej preveri izpis `npm install-scripts ls`.

### Celotni zagon v Dockerju

```bash
npm run test:e2e:docker
# Enakovredno, tudi brez lokalnega Node.js:
docker compose --profile tests run --build --rm functional-tests
```

`Dockerfile.e2e` pripravi Node.js, odvisnosti aplikacije in Chromium z OS knjižnicami. Compose zažene MongoDB, nato testni vsebnik. V njem sta aplikaciji dejansko zgrajeni in zagnani v produkcijskem načinu, emulator in brskalnik sta v istem vsebniku. Slika je namenjena ponovljivemu preverjanju, vsebuje tudi testna orodja. Slike in poročila se shranijo na računalnik prek povezanih map. Podatkov MongoDB ali pravih env datotek ne vgradimo v sliko.

```bash
# Pregled petih testov / posamezen test / poročilo
npm run test:e2e:list
npm run test:e2e -- --grep TP-05
npm run test:e2e:report
# Ročen zagon ali ustavitev samo baze
npm run db:up
npm run db:down
```

Pri Docker načinu MongoDB po zaključku ostane na voljo; ustavi ga z `docker compose stop mongodb`. Ne izvajaj hkrati dveh testnih zaganjalnikov, ker uporabljata isto namensko bazo. V testih se pred in po vsakem primeru izbriše vsebina samo te baze. Varovalka sprejme le izrecno upravljano izvedbo in predvideni lokalni naslov; pred ponastavitvijo se preveri URI. Ostalih baz fixture ne čisti.

### Testna pošta TP-01 – omejitev izvirnega scenarija

Firebase Auth emulator dejansko ustvari potrditveno povezavo, ki jo test odpre v drugem zavihku prek lokalnega pregledovalnika. Nato se preverijo potrjen naslov, prijava in trajnost seje. **Dostava zunanje e-pošte, pravi poštni predal in produkcijski pošiljatelj niso preverjeni.** To je dokumentirana prilagoditev korakov 4–6, ne popolna avtomatizacija izvirnega poštnega dela. Za tega je potreben namenski resnični Firebase projekt in dostopen testni predal. Menjava na Docker in next start te omejitve ne odpravi.

Vir: [Firebase Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth).

## 4. Sledljivost in pregled skript

Vseh pet testov je v [`e2e/tests/functional.spec.ts`](../e2e/tests/functional.spec.ts). Skupna priprava, prijava in čiščenje so v [`e2e/fixtures.ts`](../e2e/fixtures.ts). Oštevilčeni `test.step` bloki se ujemajo s koraki izvirnega dokumenta.

| Primer / funkcionalnost | Predpogoji in podatki | Avtomatizirani koraki in preverjanja | Omejitev / prilagoditev |
| --- | --- | --- | --- |
| TP-01 / F1, US1 | nov naslov, Testna Oseba, geslo 6 znakov, neprijavljen brskalnik | 1–2: registracija iz noge, pravilni vnosi in prikrito geslo; 3: obvestilo, preusmeritev, en račun v obeh shrambah; 4–6: nov zavihek in potrditev dejanske povezave; 7–8: prijava in ohranitev po osvežitvi; odjava in odstranitev računa | lokalni pregled povezav nadomesti zunanji poštni predal; zunanja dostava ni pokrita |
| TP-02 / F1, US1 | lasten nov naslov, Testna Oseba, geslo 5 znakov | 1–2: isti uporabniški vstop in veljavni ostali podatki; 3–4: zahtevano sporočilo, HTTP 400, brez uspešnega obvestila in brez prijave; 5: nič računov v obeh shrambah in nič potrditvenih povezav | brez odvisnosti od TP-01 |
| TP-03 / F4, US2 | samo A–D, dejavnosti in ocene iz dokumenta, skladne povezane ocene | 1: vsi štirje začetni zadetki; 2–3: izbrana filtra in odsotnost drugih omejitev; 4–5: natanko A in D, dejavnost in prikazani oceni 4 ter 4,1; B in C izločena | priprava in odstranitev izoliranih podatkov sta avtomatizirani |
| TP-04 / F8, US4 | neodvisen potrjen račun, kontrolni oglas TP04 Razvijalec | 1–2: navigacija in prisoten kontrolni oglas; 3–4: vnos TP04BREZZADETKOV, uspešen API odziv, nič kartic in »Ni rezultatov.«; 5: ponastavitev znova pokaže oglas, seja ostane aktivna; odjava | v majhnem izoliranem naboru straničenje ni potrebno |
| TP-05 / F15, US8 | lastno podjetje in račun, en obstoječi oglas (N = 1), novi naziv še ne obstaja | 1–2: profil in obrazec; 3–4: vsa štiri polja, en klik, preusmeritev, takojšnji prikaz enega oglasa; 5: vse podrobnosti in podjetje; 6: ponovno odprtje, osvežitev, N + 1, en zapis in pravilni podatki v bazi; odstranitev po ID in povrnitev na N | BUG-01 je popravljen; test zahteva takojšnji prikaz brez dodatnega osveževanja |

Robustnost:

- vloga in naziv elementa, oznake polj ter placeholderji imajo prednost pred strukturnimi CSS selektorji;
- povezava za registracijo je omejena na nogo in `/registracija`, saj obstaja tudi registracija podjetja;
- neoznačena izbirna seznama sta izbrana s stabilnim atributom `name` znotraj ustreznega filtra;
- čakanje temelji na vidnosti, URL-ju, API odzivu ali pogoju `expect.poll`, ne na `waitForTimeout`;
- testi preverjajo vsebino, natančno število in shranjene podatke, ne zgolj naložene strani;
- browser exceptions in lokalni HTTP 5xx povzročijo napako; konzolna opozorila so priložena poročilu;
- noben test ne potrebuje rezultata drugega. En worker prepreči tekmovanje pri ponastavljanju iste namenske baze;
- neuspeh TP-05 ni označen kot pričakovan z `test.fail`, preskočen ali skrit z `continue-on-error`.

## 5. Cevovod

`.github/workflows/workflow.yml` vsebuje:

- **Backend build and unit tests:** Node.js 22, npm ci, gradnja in Jest.
- **Production build and functional tests:** namestitev odvisnosti in Chromiuma, `npm run test:e2e`, Docker MongoDB, dejanski next build/next start ter vseh pet testov. Gradnja ni preskočena in napake tipov niso izključene.
- **SonarCloud:** izvede se samo, kadar sta za ta repozitorij nastavljeni spremenljivki SONAR_ORGANIZATION in SONAR_PROJECT_KEY ter ustrezen SONAR_TOKEN. Tuje nastavitve mtoplak se ne uporabljajo samodejno.

Sprožilci so push in pull request na main ter ročni workflow_dispatch. Funkcionalni job ima omejitev 20 minut. Artefakt `functional-test-results` vsebuje HTML, JUnit, JSON, posnetke/sledi in dnevnike, shranjene tudi ob neuspehu, 14 dni. Neničelna izhodna koda označi job kot neuspešen; continue-on-error ni uporabljen. Storitev MongoDB se ustavi tudi ob napaki.

## 6. Rezultati in ugotovljeni popravki

Prvotna razvojna izvedba in [prvi CI zagon](https://github.com/anciromih17/CareerCompass/actions/runs/42276444645) sta imela štiri uspešne teste in BUG-01 v TP-05. Zapis v `evidence/local-results.json` in `evidence/ci-results.json` ter slike BUG-01 so **zgodovinski dokazi pred popravkom**.

Ob prvem prehodu na produkcijsko gradnjo z Docker MongoDB je bilo stanje ponovno 4/5. BUG-01 je bil potrjen tudi s produkcijskim strežnikom: oglas se shrani, vrnitev na že obiskani profil pa uporabi star prikaz. V obrazcu za objavo je po uspešni oddaji dodan `router.refresh()` ob preusmeritvi na profil. Samostojni TP-05 je po popravku uspešen. Diagnostična osvežitev in expect.soft sta odstranjena iz testa; takojšnji prikaz mora uspeti brez posegov skripte.

Produkcijska gradnja je dodatno zahtevala generiranje Prisma odjemalca in nameščeno nativno vezavo bcrypt. Nastavitev baseUrl je odstranjena, edini odvisni uvoz je relativen. Backend izrecno vključuje tipe node in jest.

**Končni celotni Docker zagon: 5 uspešnih testov, 0 neuspešnih, 0 preskočenih; 23,5 sekunde izvajanja testov (brez gradnje).** Backend ima še 12 uspešnih Jest testov. [Strojni rezultat](evidence/production-results.json), [prikaz filtriranih podjetij](evidence/production-filter-results.png). Testna implementacija je v commitu `3653a94`. Stari dokazi ne predstavljajo novega produkcijskega zagona.

### Potrjena produkcijska izvedba na GitHub Actions

[Izvedba 42281580953](https://github.com/anciromih17/CareerCompass/actions/runs/42281580953) za commit `3653a94` je uspešna: **produkcijska gradnja in 5/5 funkcionalnih testov (23,3 s)** ter **backend gradnja in 12/12 Jest testov**. SonarCloud je pravilno preskočen, ker za ta repozitorij ni konfiguriran. Opravilo, ki je prej odpovedovalo zaradi manjkajoče zunanje MongoDB povezave, je nadomeščeno z dejansko gradnjo ob lokalnem Docker MongoDB.

[Artefakt functional-test-results](https://github.com/anciromih17/CareerCompass/actions/runs/42281580953/artifacts/13535592539) je na voljo do 20. 11. 2026. Rezultat v `evidence/production-ci-results.json` je trajni povzetek te izvedbe. Po poteku artefakta ponovno zaženi cevovod ali uporabi pravočasno preneseno poročilo.

## 7. Pregled avtoric in uporaba UI

Pred oddajo avtorici primerjata test.step korake s pregledanimi primeri iz 3. naloge, odpreta HTML poročilo, preverita podatke in pričakovane rezultate, samostojno izvedeta teste ter evidentirata imeni in datum pregleda. Posebej obravnavata omejitev TP-01 glede zunanje pošte.

Uporabljen je OpenAI Codex v namizni aplikaciji za pregled kode in dokumentacije, ustvarjanje skript, konfiguracijo, izvedbo ter osnutek poročila. Drugi agenti niso bili uporabljeni. Izveden Chromium ne dokazuje delovanja v vseh drugih brskalnikih ali mobilnih napravah. Varnost API-ja, chatbot, Google prijava in zmogljivost niso predmet teh petih testov.
