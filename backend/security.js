import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {get,run,now} from './db.js';
import {PRODUCTION,ORIGIN} from './config.js';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const hash = s => createHash('sha256').update(s).digest('hex');
export async function passwordHash(password) {
  const salt=token(); const derived=await scrypt(password,salt,64);
  return `${salt}:${derived.toString('hex')}`;
}
export async function passwordMatches(password,stored) {
  const [salt,value]=stored.split(':'); const actual=await scrypt(password,salt,64);
  const expected=Buffer.from(value,'hex'); return expected.length===actual.length && timingSafeEqual(expected,actual);
}
export function fail(status,message) { const e=new Error(message);e.status=status;throw e; }
export function limit(key,max=20,windowMs=900000) {
  const t=now(); const row=get('SELECT * FROM rate_limits WHERE key=?',key);
  if(!row||row.resets_at<=t) run('INSERT OR REPLACE INTO rate_limits VALUES (?,?,?)',key,1,t+windowMs);
  else {if(row.count>=max) fail(429,'Too many attempts. Please try later.');run('UPDATE rate_limits SET count=count+1 WHERE key=?',key);}
}
export function session(req) {
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cb_session='))?.slice(11);
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;
  return get('SELECT s.*,u.email,u.year_id,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND u.disabled=0',hash(raw),now());
}
export function requireUser(req) { const s=session(req);if(!s)fail(401,'Please log in.');return s; }
export function csrf(req,s) {if(req.headers.origin!==ORIGIN||req.headers['x-csrf-token']!==s.csrf)fail(403,'Request verification failed. Refresh and try again.');}
export function createSession(res,userId) {
  const raw=token(), protection=token();
  run('INSERT INTO sessions VALUES (?,?,?,?)',hash(raw),userId,protection,now()+7*86400000);
  res.setHeader('Set-Cookie',`cb_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${PRODUCTION?'; Secure':''}`);
  return protection;
}
export function access(userId) {
  return get('SELECT MAX(ends_at) AS ends_at FROM entitlements WHERE user_id=? AND revoked=0 AND starts_at<=? AND ends_at>?',userId,now(),now()).ends_at || null;
}
