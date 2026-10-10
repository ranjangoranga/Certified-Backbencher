import {createHmac,timingSafeEqual} from 'node:crypto';
import {get,run,transaction,now} from './db.js';
import {PRICE_PAISE,PERIOD_DAYS} from './config.js';
import {fail} from './security.js';
export function signatureValid(body,signature,secret) {
  if(!secret||!signature||!/^[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature,'hex'),createHmac('sha256',secret).update(body).digest());
}
export async function provider(path,method='GET',data) {
  const {RAZORPAY_KEY_ID:key,RAZORPAY_KEY_SECRET:secret}=process.env;
  if(!key||!secret)fail(503,'Payments are not configured yet.');
  const response=await fetch(`https://api.razorpay.com/v1/${path}`,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await response.json();if(!response.ok)fail(502,'Payment provider could not complete the request.');return result;
}
// Both checkout verification and webhooks enter the same transaction. One order can grant access only once.
export function grantPayment(payment) {
  return transaction(()=>{
    const order=get('SELECT * FROM orders WHERE provider_order_id=?',payment.order_id);
    if(!order)fail(404,'Unknown payment order.');
    if(payment.status!=='captured'||payment.amount!==PRICE_PAISE||payment.currency!=='INR')fail(400,'Payment is not captured for the correct amount.');
    if(order.status==='refunded')fail(409,'This payment was refunded.');
    if(order.status==='paid')return false;
    const end=get('SELECT MAX(ends_at) AS end FROM entitlements WHERE user_id=? AND revoked=0',order.user_id).end;
    const start=Math.max(now(),end||0);
    run('INSERT INTO entitlements(user_id,kind,starts_at,ends_at,source) VALUES (?,?,?,?,?)',order.user_id,'paid',start,start+PERIOD_DAYS*86400000,`order:${order.id}`);
    run("UPDATE orders SET status='paid',payment_id=? WHERE id=?",payment.id,order.id);
    return true;
  });
}
export function revokeRefund(paymentId) {
  transaction(()=>{const order=get('SELECT * FROM orders WHERE payment_id=?',paymentId);if(!order)return;
    run("UPDATE orders SET status='refunded' WHERE id=?",order.id);
    run('UPDATE entitlements SET revoked=1 WHERE source=?',`order:${order.id}`);
  });
}
