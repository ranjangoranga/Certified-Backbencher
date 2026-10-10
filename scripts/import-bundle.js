// Download the separate private Notes Bundle, unzip it outside your web root, then run this script.
// Usage: node --env-file-if-exists=.env scripts/import-bundle.js /absolute/path/notes-bundle
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {all,db} from '../backend/db.js';
import {ROOT} from '../backend/config.js';
const directory=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw new Error('Pass the extracted private notes-bundle directory');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
const resources=all('SELECT id,source_key FROM resources');db.close();
for(const file of manifest.files) {
  const resource=resources.find(x=>x.source_key===file.source_key);if(!resource)throw new Error(`Seed resource missing: ${file.source_key}`);
  if(!/^[A-Za-z0-9_-]+\.pdf$/.test(file.filename))throw new Error('Unsafe bundle filename');
  const source=path.join(directory,'pdfs',file.filename);
  if(createHash('sha256').update(fs.readFileSync(source)).digest('hex')!==file.sha256)throw new Error(`PDF checksum mismatch: ${file.filename}`);
  const result=spawnSync(process.execPath,[path.join(ROOT,'scripts/import-note.js'),String(resource.id),source],{stdio:'inherit',env:process.env});
  if(result.status!==0)throw new Error(`Import failed for resource ${resource.id}`);
}
console.log(`Imported ${manifest.files.length} PDFs. No Google connection is needed for reading.`);
