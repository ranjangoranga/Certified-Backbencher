// Optional DOM workflow checks: npm install, then npm run test:ui.
// These exercise UI logic, not screenshot/rendering compatibility in a real browser.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {JSDOM}=require('jsdom');
test('Registration, membership gate and course-year screens',async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cb-ui-'));
  process.env.STORAGE_DIR=temp;process.env.APP_ORIGIN='http://localhost:3000';
  const {server}=await import('../backend/server.js');const {db}=await import('../backend/db.js');await import('../scripts/seed.js');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const html=fs.readFileSync(path.join(__dirname,'../html/index.html'),'utf8');
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:process.env.APP_ORIGIN,runScripts:'dangerously'});const w=dom.window;let cookie='';const alerts=[];
  w.scrollTo=()=>{};w.alert=message=>alerts.push(message);
  w.fetch=async(url,options={})=>{const response=await fetch(base+url,{...options,headers:{...options.headers,Origin:process.env.APP_ORIGIN,Cookie:cookie}});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;};
  for(const name of ['app','features']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(__dirname,`../javascript/${name}.js`),'utf8');w.document.body.appendChild(script);}
  const wait=async expression=>{for(let i=0;i<100;i++){if(w.eval(expression))return;await new Promise(r=>setTimeout(r,20));}throw new Error('UI condition timed out: '+expression);};
  t.after(()=>{w.close();server.close();db.close();fs.rmSync(temp,{recursive:true,force:true});});
  await wait('appState.years.length===8');
  assert.equal(w.document.querySelectorAll('#allSubjects .subject-card').length,7);
  w.openLogin();w.setAuthMode('register');assert.equal(w.document.getElementById('registrationFields').hidden,false);
  w.document.getElementById('authEmail').value='ui@example.com';w.document.getElementById('authPassword').value='UI-secure-password-123';
  w.document.getElementById('authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait("appState.user?.email==='ui@example.com' && appState.currentPage==='subjects'");
  assert.equal(w.document.getElementById('accountNav').textContent,'Account');
  w.openSubject('PPM');w.openResource('PPM','notes');assert.equal(w.document.querySelectorAll('#resourceDetailContent .pdf-item').length,4);
  await w.openReader(2);assert.equal(w.eval('appState.currentPage'),'account');assert.match(w.document.getElementById('accountMessage').textContent,/membership/);
  assert.ok(!w.document.getElementById('resourceDetailContent').innerHTML.includes('drive.google'));
  const course=w.document.getElementById('profilecourseSelect');course.value='MCA';course.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.getElementById('profileyearSelect').options.length,2);w.document.getElementById('profileyearSelect').selectedIndex=1;
  w.document.getElementById('profileForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait('subjects.length===0');
  assert.match(w.document.getElementById('allSubjects').textContent,/Coming soon/);assert.equal(alerts.length,0);
});
