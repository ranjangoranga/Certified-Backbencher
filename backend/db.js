import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, STORAGE} from './config.js';
fs.mkdirSync(STORAGE, {recursive:true, mode:0o700});
export const db = new DatabaseSync(path.join(STORAGE, 'app.sqlite'));
// Rollback journals avoid shared-memory requirements; use one server and a persistent local disk.
db.exec('PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(fs.readFileSync(path.join(ROOT,'database/schema.sql'),'utf8'));
export const get = (sql,...params) => db.prepare(sql).get(...params);
export const all = (sql,...params) => db.prepare(sql).all(...params);
export const run = (sql,...params) => db.prepare(sql).run(...params);
export function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) {db.exec('ROLLBACK'); throw e;} }
export const now = () => Date.now();
