import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIAS, TIPOS, mesActual, finDePlanPorDefecto } from './defaults.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'presupuesto.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gasto','ingreso')),
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  color TEXT NOT NULL DEFAULT 'c1',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS expense_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  is_debt INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gasto','ingreso')),
  name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  type_id INTEGER REFERENCES expense_types(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES movements(id) ON DELETE CASCADE,
  start_month TEXT NOT NULL,
  end_month TEXT,
  every INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS movement_overrides (
  movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (movement_id, month)
);
CREATE TABLE IF NOT EXISTS savings_plan (
  month TEXT PRIMARY KEY,
  amount INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mov_parent ON movements(parent_id);
CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

export const SETTING_KEYS = ['plan_start', 'plan_end', 'hacienda'];

function sembrarCategorias() {
  const insCat = db.prepare('INSERT INTO categories (kind, name, parent_id, color, sort) VALUES (?, ?, ?, ?, ?)');
  CATEGORIAS.forEach((c, i) => {
    const { lastInsertRowid } = insCat.run(c.kind, c.name, null, c.color, i);
    c.subs.forEach((s, j) => insCat.run(c.kind, s, lastInsertRowid, c.color, j));
  });
}
function sembrarTipos() {
  const insTipo = db.prepare('INSERT INTO expense_types (name, is_debt, sort) VALUES (?, ?, ?)');
  TIPOS.forEach((t, i) => insTipo.run(t.name, t.is_debt, i));
}

export function sembrarSiVacia() {
  db.transaction(() => {
    if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) sembrarCategorias();
    if (db.prepare('SELECT COUNT(*) AS n FROM expense_types').get().n === 0) sembrarTipos();
    const set = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    set.run('plan_start', JSON.stringify(mesActual()));
    set.run('plan_end', JSON.stringify(finDePlanPorDefecto()));
  })();
}

export function leerAjustes() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (!SETTING_KEYS.includes(r.key)) continue;
    try { out[r.key] = JSON.parse(r.value); } catch { /* valor corrupto: se ignora */ }
  }
  return out;
}

export function leerTodo() {
  const categories = db.prepare('SELECT id, kind, name, parent_id, color, sort FROM categories ORDER BY kind, sort, id').all();
  const types = db.prepare('SELECT id, name, is_debt, sort FROM expense_types ORDER BY sort, id').all();
  const movements = db.prepare(`SELECT id, kind, name, amount, category_id, type_id, parent_id, start_month, end_month,
    every, notes, sort, updated_at FROM movements ORDER BY sort, id`).all();
  const overrides = db.prepare('SELECT movement_id, month, amount FROM movement_overrides').all();
  const porMov = new Map();
  for (const o of overrides) {
    if (!porMov.has(o.movement_id)) porMov.set(o.movement_id, {});
    porMov.get(o.movement_id)[o.month] = o.amount;
  }
  for (const m of movements) m.overrides = porMov.get(m.id) || {};
  const plan = {};
  for (const r of db.prepare('SELECT month, amount FROM savings_plan').all()) plan[r.month] = r.amount;
  return { categories, types, movements, plan, settings: leerAjustes() };
}

// Sustituye todos los datos del presupuesto (no toca usuarios ni sesiones).
export function importarTodo(data) {
  db.transaction(() => {
    db.exec('DELETE FROM movement_overrides; DELETE FROM movements; DELETE FROM categories; DELETE FROM expense_types; DELETE FROM savings_plan; DELETE FROM settings;');
    const insCat = db.prepare('INSERT INTO categories (id, kind, name, parent_id, color, sort) VALUES (?, ?, ?, ?, ?, ?)');
    const cats = [...data.categories].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
    for (const c of cats) insCat.run(c.id, c.kind, c.name, c.parent_id ?? null, c.color || 'c1', c.sort ?? 0);
    const insTipo = db.prepare('INSERT INTO expense_types (id, name, is_debt, sort) VALUES (?, ?, ?, ?)');
    for (const t of data.types) insTipo.run(t.id, t.name, t.is_debt ? 1 : 0, t.sort ?? 0);
    const insMov = db.prepare(`INSERT INTO movements (id, kind, name, amount, category_id, type_id, parent_id, start_month, end_month, every, notes, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insOv = db.prepare('INSERT INTO movement_overrides (movement_id, month, amount) VALUES (?, ?, ?)');
    // Padres antes que hijos.
    const pendientes = [...data.movements];
    const hechos = new Set();
    let vueltas = 0;
    while (pendientes.length && vueltas < 50) {
      vueltas++;
      for (let i = pendientes.length - 1; i >= 0; i--) {
        const m = pendientes[i];
        if (m.parent_id != null && !hechos.has(m.parent_id)) continue;
        insMov.run(m.id, m.kind, m.name, m.amount, m.category_id ?? null, m.type_id ?? null, m.parent_id ?? null,
          m.start_month, m.end_month ?? null, m.every || 1, m.notes || '', m.sort ?? 0);
        for (const [mes, imp] of Object.entries(m.overrides || {})) insOv.run(m.id, mes, imp);
        hechos.add(m.id);
        pendientes.splice(i, 1);
      }
    }
    if (pendientes.length) throw new Error('Hay gastos que dependen de otros que no existen en la copia.');
    const insPlan = db.prepare('INSERT INTO savings_plan (month, amount) VALUES (?, ?)');
    for (const [mes, imp] of Object.entries(data.plan || {})) insPlan.run(mes, imp);
    const insSet = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const k of SETTING_KEYS) if (data.settings && data.settings[k] !== undefined) insSet.run(k, JSON.stringify(data.settings[k]));
  })();
  sembrarSiVacia();
}
