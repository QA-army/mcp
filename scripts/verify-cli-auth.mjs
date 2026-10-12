import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('src/cli-auth/provenance.json',root),'utf8'));
if (!/^[a-f0-9]{40}$/.test(manifest.revision) || manifest.repository !== 'https://github.com/QA-army/cli') throw new Error('CLI auth provenance is invalid');
for (const [name,hash] of Object.entries(manifest.files)) {
  if (!/^[a-z-]+\.ts$/.test(name)) throw new Error('CLI auth provenance path is invalid');
  const actual=createHash('sha256').update(await readFile(new URL(`src/cli-auth/${name}`,root))).digest('hex');
  if (actual!==hash) throw new Error(`Canonical CLI auth bytes changed: ${name}`);
}
console.log(`Canonical CLI auth provenance verified: ${manifest.revision}`);
