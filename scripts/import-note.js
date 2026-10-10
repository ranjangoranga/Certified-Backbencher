// Usage: node --env-file-if-exists=.env scripts/import-note.js RESOURCE_ID /absolute/file.pdf
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ROOT,STORAGE} from '../backend/config.js';
import {get,run,now,db} from '../backend/db.js';
const [id,file]=process.argv.slice(2);
if(!id||!file||!get('SELECT id FROM resources WHERE id=?',Number(id)))throw new Error('Use a valid resource ID and PDF path');
const signature=Buffer.alloc(5);const fd=fs.openSync(file,'r');fs.readSync(fd,signature,0,5,0);fs.closeSync(fd);
if(signature.toString()!=='%PDF-')throw new Error('The source is not a PDF');
const key=randomBytes(16).toString('hex');const directory=path.join(STORAGE,'pages',key);
const result=spawnSync(process.env.PYTHON||'python3',[path.join(ROOT,'scripts/render_pdf.py'),path.resolve(file),directory],{encoding:'utf8',timeout:300000,maxBuffer:1024*1024});
if(result.status!==0){fs.rmSync(directory,{recursive:true,force:true});throw new Error('PDF import failed: '+result.stderr);}
const {pages}=JSON.parse(result.stdout);if(!pages)throw new Error('PDF is empty');
fs.mkdirSync(path.join(STORAGE,'pdfs'),{recursive:true,mode:0o700});fs.copyFileSync(file,path.join(STORAGE,'pdfs',`${key}.pdf`));
const old=get('SELECT storage_key FROM resources WHERE id=?',Number(id));
run('UPDATE resources SET storage_key=?,pages=? WHERE id=?',key,pages,Number(id));
run('INSERT INTO audit_log(action,target,created_at) VALUES (?,?,?)','import-note',id,now());
if(old.storage_key){fs.rmSync(path.join(STORAGE,'pages',old.storage_key),{recursive:true,force:true});fs.rmSync(path.join(STORAGE,'pdfs',`${old.storage_key}.pdf`),{force:true});}
console.log(`Imported resource ${id}: ${pages} private pages.`);
db.close();
