import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,STORAGE,ORIGIN,PRODUCTION,PRICE_PAISE} from './config.js';
import {all,get,run,now} from './db.js';
import {fail,limit,session,requireUser,csrf,createSession,passwordHash,passwordMatches,access} from './security.js';
import {provider,signatureValid,grantPayment,revokeRefund} from './billing.js';
export function catalog() {
  return all('SELECT y.id,y.year_number,c.code,c.name AS course_name,g.id AS college_id,g.name AS college_name FROM course_years y JOIN courses c ON c.id=y.course_id JOIN colleges g ON g.id=c.college_id WHERE y.active=1 AND c.active=1 AND g.active=1 ORDER BY g.id,c.id,y.year_number');
}
function profile(s) {return {id:s.user_id,email:s.email,year_id:s.year_id,access_until:access(s.user_id),trial:get('SELECT status,instagram_handle FROM trial_requests WHERE user_id=?',s.user_id)||null};}
function json(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function body(req) {let length=0;const parts=[];for await(const chunk of req){length+=chunk.length;if(length>32768)fail(413,'Request too large.');parts.push(chunk);}return Buffer.concat(parts);}
function integer(value) {const n=Number(value);if(!Number.isSafeInteger(n)||n<1)fail(400,'Invalid identifier.');return n;}
function resourceFor(s,id) {
  if(!access(s.user_id))fail(402,'Active membership is required.');
  const resource=get('SELECT r.* FROM resources r JOIN subjects s ON s.id=r.subject_id JOIN course_years y ON y.id=s.year_id JOIN courses c ON c.id=y.course_id JOIN colleges g ON g.id=c.college_id WHERE r.id=? AND s.year_id=? AND r.active=1 AND s.active=1 AND y.active=1 AND c.active=1 AND g.active=1',id,s.year_id);
  if(!resource)fail(404,'Resource not found for your course and year.');
  if(!resource.storage_key||!resource.pages)fail(409,'This resource has not been imported yet.');
  return resource;
}
let rendering=0;
function watermarkedPage(source,label) {
  if(rendering>=4)fail(503,'Reader is busy. Please retry shortly.');rendering++;
  return new Promise((resolve,reject)=>{
    const proc=spawn(process.env.PYTHON||'python3',[path.join(ROOT,'scripts/watermark.py'),source,label]);
    const chunks=[];let total=0;let done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);rendering--;error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{proc.kill('SIGKILL');finish(new Error('Render timeout'));},15000);
    proc.stdout.on('data',c=>{total+=c.length;if(total>20000000){proc.kill();finish(new Error('Page too large'));}else chunks.push(c);});
    proc.on('error',e=>finish(e));proc.on('close',code=>finish(code===0?null:new Error('Page render failed'),Buffer.concat(chunks)));
  });
}
export const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  // Original inline click handlers are retained to preserve the current UI. CSS/JS have separate folders.
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.razorpay.com; connect-src 'self' https://*.razorpay.com; frame-src https://*.razorpay.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if(PRODUCTION)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try {
    const url=new URL(req.url,ORIGIN);const route=url.pathname;const method=req.method;
    const address=req.socket.remoteAddress||'unknown'; // Do not trust spoofable X-Forwarded-For headers.
    if(route.startsWith('/api/'))limit(`api:${address}`,600,60000);
    if(route==='/api/health'&&method==='GET')return json(res,200,{ok:true});
    if(route==='/api/catalog'&&method==='GET')return json(res,200,{years:catalog(),price_paise:PRICE_PAISE,instagram_url:process.env.INSTAGRAM_URL||null});
    if(route==='/api/me'&&method==='GET'){const s=session(req);return json(res,200,{user:s?profile(s):null,csrf:s?.csrf||null});}
    if(route==='/api/register'||route==='/api/login') {
      if(method!=='POST')fail(405,'Use POST.');if(req.headers.origin!==ORIGIN)fail(403,'Invalid origin.');
      limit(`auth:${address}`,30);const data=JSON.parse((await body(req)).toString());
      const email=String(data.email||'').trim().toLowerCase(), password=String(data.password||'');
      if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||password.length<10||password.length>128)fail(400,'Use a valid email and a password of 10–128 characters.');
      limit(`email:${email}`,10);
      let user;
      if(route==='/api/register') {
        const year=integer(data.year_id);if(!catalog().some(x=>x.id===year))fail(400,'Choose an available college, course and year.');
        if(get('SELECT id FROM users WHERE email=?',email))fail(409,'This email already has an account. Please log in.');
        const hashed=await passwordHash(password);
        const id=run('INSERT INTO users(email,password_hash,year_id,created_at) VALUES (?,?,?,?)',email,hashed,year,now()).lastInsertRowid;
        user={id:Number(id)};
      } else {
        user=get('SELECT * FROM users WHERE email=?',email);
        // Derive even for unknown accounts to avoid a trivial timing distinction.
        const fallback='0'.repeat(64)+':'+ '0'.repeat(128);
        const valid=await passwordMatches(password,user?.password_hash||fallback);
        if(!user||!valid||user.disabled)fail(401,'Email or password is incorrect.');
      }
      const old=session(req);if(old)run('DELETE FROM sessions WHERE token_hash=?',old.token_hash);
      const protection=createSession(res,user.id);return json(res,200,{csrf:protection});
    }
    if(route==='/api/webhook'&&method==='POST') {
      const raw=await body(req);if(!signatureValid(raw,req.headers['x-razorpay-signature'],process.env.RAZORPAY_WEBHOOK_SECRET))fail(400,'Invalid webhook signature.');
      const event=JSON.parse(raw);const eventId=req.headers['x-razorpay-event-id'];
      if(typeof eventId!=='string'||eventId.length>200)fail(400,'Missing event ID.');
      if(get('SELECT id FROM webhook_events WHERE id=?',eventId))return json(res,200,{ok:true});
      if(event.event==='payment.captured')grantPayment(event.payload.payment.entity);
      if(event.event==='refund.processed')revokeRefund(event.payload.refund.entity.payment_id);
      run('INSERT OR IGNORE INTO webhook_events VALUES (?,?)',eventId,now());return json(res,200,{ok:true});
    }
    if(route.startsWith('/api/')) {
      const s=requireUser(req);if(method!=='GET')csrf(req,s);
      if(route==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE token_hash=?',s.token_hash);res.setHeader('Set-Cookie',`cb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${PRODUCTION?'; Secure':''}`);return json(res,200,{ok:true});}
      if(route==='/api/profile'&&method==='POST') {
        const data=JSON.parse(await body(req));const year=integer(data.year_id);if(!catalog().some(x=>x.id===year))fail(400,'Year is unavailable.');
        run('UPDATE users SET year_id=? WHERE id=?',year,s.user_id);return json(res,200,{ok:true});
      }
      if(route==='/api/password'&&method==='POST') {
        const data=JSON.parse(await body(req));limit(`password:${s.user_id}`,5);
        const user=get('SELECT password_hash FROM users WHERE id=?',s.user_id);
        const password=String(data.password||'');if(password.length<10||password.length>128)fail(400,'Password must contain 10–128 characters.');
        if(!await passwordMatches(String(data.current_password||''),user.password_hash))fail(403,'Current password is incorrect.');
        run('UPDATE users SET password_hash=? WHERE id=?',await passwordHash(password),s.user_id);
        run('DELETE FROM sessions WHERE user_id=?',s.user_id);createSession(res,s.user_id);return json(res,200,{ok:true});
      }
      if(route==='/api/subjects'&&method==='GET')return json(res,200,{subjects:all('SELECT id,code,name,description,color FROM subjects WHERE year_id=? AND active=1',s.year_id)});
      if(route==='/api/resources'&&method==='GET')return json(res,200,{resources:all('SELECT r.id,r.subject_id,r.type,r.name,r.description,r.pages FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE s.year_id=? AND r.active=1 AND s.active=1',s.year_id)});
      if(route==='/api/trial'&&method==='POST') {
        if(!process.env.INSTAGRAM_URL)fail(503,'Instagram trial is not configured yet.');
        const data=JSON.parse(await body(req));const handle=String(data.instagram_handle||'').trim().replace(/^@/,'');
        if(!/^[A-Za-z0-9._]{1,30}$/.test(handle))fail(400,'Enter a valid Instagram username.');
        if(get('SELECT id FROM trial_requests WHERE user_id=?',s.user_id))fail(409,'This account already requested its one-time trial.');
        run('INSERT INTO trial_requests(user_id,instagram_handle,requested_at) VALUES (?,?,?)',s.user_id,handle,now());
        return json(res,201,{status:'pending',message:'Follow request saved. Access begins after your follow is verified.'});
      }
      if(route==='/api/orders'&&method==='POST') {
        limit(`order:${s.user_id}`,5,60000);
        if(!all('SELECT r.id FROM resources r JOIN subjects sub ON sub.id=r.subject_id WHERE sub.year_id=? AND r.storage_key IS NOT NULL AND r.active=1 AND sub.active=1',s.year_id).length)fail(409,'No readable notes are available for this year yet.');
        const order=await provider('orders','POST',{amount:PRICE_PAISE,currency:'INR',receipt:`cb_${s.user_id}_${now()}`});
        run('INSERT INTO orders(user_id,provider_order_id,amount,currency,created_at) VALUES (?,?,?,?,?)',s.user_id,order.id,PRICE_PAISE,'INR',now());
        return json(res,201,{order_id:order.id,key:process.env.RAZORPAY_KEY_ID,amount:PRICE_PAISE,currency:'INR'});
      }
      if(route==='/api/payments/verify'&&method==='POST') {
        const p=JSON.parse(await body(req));
        const order=get('SELECT * FROM orders WHERE provider_order_id=? AND user_id=?',String(p.razorpay_order_id||''),s.user_id);if(!order)fail(404,'Unknown order.');
        if(!signatureValid(`${order.provider_order_id}|${p.razorpay_payment_id}`,p.razorpay_signature,process.env.RAZORPAY_KEY_SECRET))fail(400,'Invalid payment signature.');
        if(!/^pay_[A-Za-z0-9]+$/.test(p.razorpay_payment_id))fail(400,'Invalid payment ID.');
        const payment=await provider(`payments/${p.razorpay_payment_id}`);if(payment.order_id!==order.provider_order_id)fail(400,'Payment order mismatch.');
        grantPayment(payment);return json(res,200,{access_until:access(s.user_id)});
      }
      const noteMatch=route.match(/^\/api\/notes\/(\d+)(?:\/pages\/(\d+))?$/);
      if(noteMatch&&method==='GET') {
        const r=resourceFor(s,integer(noteMatch[1]));
        if(!noteMatch[2])return json(res,200,{id:r.id,name:r.name,pages:r.pages});
        const page=integer(noteMatch[2]);if(page>r.pages)fail(404,'Page not found.');limit(`reader:${s.user_id}`,100,60000);
        if(!/^[a-f0-9]{32}$/.test(r.storage_key))throw new Error('Invalid private storage key');
        const file=path.join(STORAGE,'pages',r.storage_key,`${page}.png`);if(!fs.existsSync(file))fail(404,'Page is unavailable.');
        const image=await watermarkedPage(file,`${s.email} | ${new Date().toISOString().slice(0,10)} | Certified Backbencher`);
        // Re-check after rendering so expired memberships do not complete a slow request.
        resourceFor(s,r.id);res.writeHead(200,{'Content-Type':'image/png'});return res.end(image);
      }
      fail(404,'Endpoint not found.');
    }
    if(method!=='GET'&&method!=='HEAD')fail(405,'Method not allowed.');
    let file;
    if(route==='/'||route==='/index.html'||route==='/html/index.html')file=path.join(ROOT,'html/index.html');
    else if(/^\/(css|javascript)\/[a-z0-9-]+\.(css|js)$/.test(route))file=path.join(ROOT,route);
    else fail(404,'Page not found.');
    if(!fs.existsSync(file))fail(404,'File not found.');
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
    res.statusCode=200;if(method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
  }catch(e){if(res.headersSent)return res.end();const status=e.status|| (e instanceof SyntaxError?400:500);if(status===500)console.error('Request failed:',e.message);json(res,status,{error:status===500?'The server could not complete your request.':e.message});}
});
if(process.argv[1]===new URL(import.meta.url).pathname)server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Certified Backbencher running on ${ORIGIN}`));
