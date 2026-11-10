// Comprueba que una base de datos de la primera versión (un único presupuesto)
// se actualiza sola al arrancar, sin perder datos y dejando una copia.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const PORT = 3990 + Math.floor(Math.random() * 9);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presupuesto-migra-'));
let srv;

function hashV0(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

before(async () => {
  // Esquema exacto de la versión 1.0 (sin presupuestos).
  const db = new Database(path.join(dir, 'presupuesto.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('gasto','ingreso')), name TEXT NOT NULL, parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE, color TEXT NOT NULL DEFAULT 'c1', sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE expense_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_debt INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE movements (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('gasto','ingreso')), name TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, type_id INTEGER REFERENCES expense_types(id) ON DELETE SET NULL, parent_id INTEGER REFERENCES movements(id) ON DELETE CASCADE, start_month TEXT NOT NULL, end_month TEXT, every INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE movement_overrides (movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE, month TEXT NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY (movement_id, month));
    CREATE TABLE savings_plan (month TEXT PRIMARY KEY, amount INTEGER NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('roberto', hashV0('mi-contraseña-1'));
  db.prepare("INSERT INTO categories (id, kind, name, color) VALUES (7, 'gasto', 'Deudas y plazos', 'c7')").run();
  db.prepare("INSERT INTO expense_types (id, name, is_debt) VALUES (3, 'Deuda', 1)").run();
  db.prepare("INSERT INTO movements (id, kind, name, amount, category_id, type_id, start_month, end_month) VALUES (11, 'gasto', 'Suministros', 0, 7, 3, '2026-12', NULL)").run();
  db.prepare("INSERT INTO movements (id, kind, name, amount, parent_id, start_month) VALUES (12, 'gasto', 'Luz', 2500, 11, '2026-12')").run();
  db.prepare("INSERT INTO movement_overrides (movement_id, month, amount) VALUES (12, '2027-01', 0)").run();
  db.prepare("INSERT INTO savings_plan (month, amount) VALUES ('2027-06', 85000)").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('plan_end', '\"2027-12\"')").run();
  db.close();

  srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, REGISTRO: 'cerrado' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch { /* aún arrancando */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('El servidor no arrancó');
});
after(() => { srv?.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows */ } });

test('la cuenta y los datos anteriores siguen ahí tras actualizar', async () => {
  const login = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'presupuesto' }, body: JSON.stringify({ username: 'roberto', password: 'mi-contraseña-1' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const d = await (await fetch(BASE + '/api/data', { headers: { Cookie: cookie } })).json();
  const luz = d.movements.find(m => m.name === 'Luz');
  assert.equal(d.movements.length, 2);
  assert.equal(luz.parent_id, 11);
  assert.equal(luz.overrides['2027-01'], 0);
  assert.equal(d.plan['2027-06'], 85000);
  assert.equal(d.settings.plan_end, '2027-12');
  assert.ok(d.types.some(t => t.name === 'Deuda' && t.is_debt));
});

test('deja una copia de la base de datos anterior y el registro cerrado', async () => {
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('presupuesto-antes-de-actualizar-')));
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.registro, 'cerrado');
});
