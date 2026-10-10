import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cb-test-'));
process.env.STORAGE_DIR=temp;process.env.APP_ORIGIN='http://localhost:3000';process.env.INSTAGRAM_URL='https://www.instagram.com/example/';
const {server}=await import('../backend/server.js');
const {run,get,all,now,db}=await import('../backend/db.js');
const {passwordHash,passwordMatches,access}=await import('../backend/security.js');
const {grantPayment,revokeRefund,signatureValid}=await import('../backend/billing.js');
await import('../scripts/seed.js');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let cookie='',csrf='';
async function request(route,method='GET',data,extra={}) {
 const res=await fetch(base+route,{method,headers:{Origin:process.env.APP_ORIGIN,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json',...extra},body:data?JSON.stringify(data):undefined});
 const result=(res.headers.get('content-type')||'').includes('application/json')?await res.json():await res.arrayBuffer();
 if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {res,result};
}
test('Authentication, access control and payment lifecycle',async t=>{
 t.after(()=>{server.close();db.close();fs.rmSync(temp,{recursive:true,force:true});});
 const years=all('SELECT id FROM course_years ORDER BY id');
 const password='A-secure-password-123';
 await t.test('Passwords are salted and verifiable',async()=>{const a=await passwordHash(password),b=await passwordHash(password);assert.notEqual(a,b);assert.equal(await passwordMatches(password,a),true);assert.equal(await passwordMatches('wrong',a),false);});
 await t.test('Seed includes all three courses and correct year counts',()=>{assert.equal(years.length,8);assert.equal(get('SELECT COUNT(*) AS n FROM subjects').n,7);assert.equal(get('SELECT COUNT(*) AS n FROM resources').n,27);});
 await t.test('Unauthenticated notes and private paths are blocked',async()=>{assert.equal((await request('/api/notes/1')).res.status,401);for(const p of ['/storage/app.sqlite','/database/legacy-resources.json','/.env','/docs/original-index.html'])assert.equal((await request(p)).res.status,404);});
 await t.test('Signup stores course and creates HttpOnly session',async()=>{const r=await request('/api/register','POST',{email:'STUDENT@example.com',password,year_id:years[0].id});assert.equal(r.res.status,200);csrf=r.result.csrf;assert.ok(r.res.headers.get('set-cookie').includes('HttpOnly'));assert.equal(get('SELECT email FROM users').email,'student@example.com');assert.equal(get('SELECT year_id FROM users').year_id,years[0].id);});
 const user=get('SELECT id FROM users').id;
 await t.test('Duplicate email rejected and incorrect login denied',async()=>{assert.equal((await request('/api/register','POST',{email:'student@example.com',password,year_id:years[0].id})).res.status,409);assert.equal((await request('/api/login','POST',{email:'student@example.com',password:'Wrong-password-123'})).res.status,401);});
 await t.test('CSRF is enforced',async()=>{assert.equal((await request('/api/profile','POST',{year_id:years[1].id},{'X-CSRF-Token':'bad'})).res.status,403);});
 await t.test('Membership required even when requesting direct page URL',async()=>{assert.equal((await request('/api/notes/2/pages/1')).res.status,402);});
 await t.test('Instagram click/request alone grants no access',async()=>{assert.equal((await request('/api/trial','POST',{instagram_handle:'student_ig'})).res.status,201);assert.equal(access(user),null);assert.equal((await request('/api/trial','POST',{instagram_handle:'student_ig'})).res.status,409);});
 await t.test('Approved trial grants 30 days and cannot be reused',async()=>{const id=get('SELECT id FROM trial_requests').id;let cli=spawnSync(process.execPath,['scripts/admin.js','trial-approve',String(id)],{env:process.env,encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.ok(access(user)>now());cli=spawnSync(process.execPath,['scripts/admin.js','trial-approve',String(id)],{env:process.env});assert.notEqual(cli.status,0);});
 await t.test('Private reader page is watermarked and not cached',async()=>{
  const r=get("SELECT id FROM resources WHERE type='notes' LIMIT 1");const key='a'.repeat(32);const dir=path.join(temp,'pages',key);fs.mkdirSync(dir,{recursive:true});
  const py=spawnSync(process.env.PYTHON||'python3',['-c',`from PIL import Image; Image.new('RGB',(600,800),'white').save(${JSON.stringify(path.join(dir,'1.png'))})`]);assert.equal(py.status,0);
  run('UPDATE resources SET storage_key=?,pages=1 WHERE id=?',key,r.id);
  const reply=await request(`/api/notes/${r.id}/pages/1`);assert.equal(reply.res.status,200);assert.equal(reply.res.headers.get('cache-control'),'no-store, private');assert.ok(reply.result.byteLength>2000);
  assert.equal((await request(`/api/notes/${r.id}/pages/2`)).res.status,404);
  run('UPDATE users SET year_id=? WHERE id=?',years[1].id,user);assert.equal((await request(`/api/notes/${r.id}/pages/1`)).res.status,404);run('UPDATE users SET year_id=? WHERE id=?',years[0].id,user);
 });
 await t.test('Expired trials are rejected without a cleanup job',async()=>{run("UPDATE entitlements SET ends_at=? WHERE user_id=?",now()-1,user);assert.equal(access(user),null);assert.equal((await request('/api/notes/2/pages/1')).res.status,402);});
 await t.test('Payments require captured correct amount; duplicates do not extend access',()=>{
  run('INSERT INTO orders(user_id,provider_order_id,amount,currency,created_at) VALUES (?,?,?,?,?)',user,'order_test',4900,'INR',now());
  const p={id:'pay_test',order_id:'order_test',amount:4900,currency:'INR',status:'authorized'};assert.throws(()=>grantPayment(p));assert.throws(()=>grantPayment({...p,status:'captured',amount:1}));
  assert.equal(grantPayment({...p,status:'captured'}),true);const end=access(user);assert.equal(grantPayment({...p,status:'captured'}),false);assert.equal(access(user),end);assert.ok(end-now()>29*86400000);
  revokeRefund('pay_test');assert.equal(access(user),null);assert.throws(()=>grantPayment({...p,status:'captured'}));
 });
 await t.test('Webhook signature rejects tampering',()=>{const raw=Buffer.from('{"event":"payment.captured"}');const sig=createHmac('sha256','secret').update(raw).digest('hex');assert.equal(signatureValid(raw,sig,'secret'),true);assert.equal(signatureValid(Buffer.from('changed'),sig,'secret'),false);assert.equal(signatureValid(raw,'wrong','secret'),false);});
 await t.test('Empty years do not sell unavailable notes',async()=>{await request('/api/profile','POST',{year_id:years[1].id});assert.equal((await request('/api/subjects')).result.subjects.length,0);assert.equal((await request('/api/orders','POST',{})).res.status,409);});
 await t.test('Logout invalidates the session',async()=>{assert.equal((await request('/api/logout','POST',{})).res.status,200);assert.equal((await request('/api/me')).result.user,null);});
});
