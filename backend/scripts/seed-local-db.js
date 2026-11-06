// Local seed via the application's API; existing records are preserved.
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://127.0.0.1:4000';
async function request(route, data) {
  const response = await fetch(base + route, data ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)} : {});
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return response.json();
}
async function main() {
  const existing = await request('/company');
  if (existing.length) { console.log(`Baza že vsebuje ${existing.length} podjetij; uvoz preskočen.`); return; }
  for (const [file, route, label] of [['scraped_results.json','/company','Podjetja'],['scrapedJobAds.json','/job','Oglasi za delo']]) {
    const records=JSON.parse(fs.readFileSync(path.join(__dirname,'../../scraper',file),'utf8'));
    let ok=0;
    for (const record of records) {
      try { await request(route,record); ok++; }
      catch(e) { console.log(`Preskočeno: ${record.name || record.position}: ${e.message}`); }
    }
    console.log(`${label}: ${ok}/${records.length}`);
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
