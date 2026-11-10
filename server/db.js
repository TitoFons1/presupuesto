import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIAS, TIPOS, mesActual, finDePlanPorDefecto } from './defaults.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'presupuesto.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/*
  Esquema 1: cada presupuesto (budget) tiene sus propios datos.
  Una cuenta (user) pertenece a un presupuesto; varias cuentas pueden compartir uno.
*/
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Presupuesto',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE,
  prefs TEXT NOT NULL DEFAULT '{}',
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
  sort INTEGER NOT NULL DEFAULT 0,
  budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS expense_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  is_debt INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS movement_overrides (
  movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (movement_id, month)
);
CREATE TABLE IF NOT EXISTS savings_plan (
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (budget_id, month)
);
CREATE TABLE IF NOT EXISTS settings (
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (budget_id, key)
);
CREATE INDEX IF NOT EXISTS idx_mov_parent ON movements(parent_id);
CREATE INDEX IF NOT EXISTS idx_mov_budget ON movements(budget_id);
CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_cat_budget ON categories(budget_id);
CREATE INDEX IF NOT EXISTS idx_tipo_budget ON expense_types(budget_id);
CREATE INDEX IF NOT EXISTS idx_users_budget ON users(budget_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

const existeTabla = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const columnas = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

// Pasa una base de datos de la primera versión (un único presupuesto compartido)
// al esquema 1. Antes guarda una copia del archivo junto a la base de datos.
function migrarDesdeV0() {
  db.pragma('wal_checkpoint(TRUNCATE)');
  const copia = path.join(DATA_DIR, `presupuesto-antes-de-actualizar-${new Date().toISOString().slice(0, 10)}.db`);
  if (!fs.existsSync(copia)) fs.copyFileSync(DB_PATH, copia);
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`CREATE TABLE budgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Presupuesto', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    db.prepare("INSERT INTO budgets (id, name) VALUES (1, 'Presupuesto')").run();
    for (const t of ['users', 'categories', 'expense_types', 'movements']) {
      db.exec(`ALTER TABLE ${t} ADD COLUMN budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE`);
      db.exec(`UPDATE ${t} SET budget_id = 1`);
    }
    db.exec(`ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'`);
    db.exec(`
      CREATE TABLE savings_plan_nueva (budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE, month TEXT NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY (budget_id, month));
      INSERT INTO savings_plan_nueva (budget_id, month, amount) SELECT 1, month, amount FROM savings_plan;
      DROP TABLE savings_plan;
      ALTER TABLE savings_plan_nueva RENAME TO savings_plan;
      CREATE TABLE settings_nueva (budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (budget_id, key));
      INSERT INTO settings_nueva (budget_id, key, value) SELECT 1, key, value FROM settings;
      DROP TABLE settings;
      ALTER TABLE settings_nueva RENAME TO settings;
    `);
  })();
  db.pragma('foreign_keys = ON');
  console.log(`Base de datos actualizada a varios presupuestos. Copia de la anterior: ${copia}`);
}

(function prepararEsquema() {
  const version = db.pragma('user_version', { simple: true });
  if (version < 1 && existeTabla('users') && !columnas('users').includes('budget_id')) migrarDesdeV0();
  db.exec(ESQUEMA);
  if (version < 1) db.pragma('user_version = 1');
})();

export const SETTING_KEYS = ['plan_start', 'plan_end', 'hacienda'];

/* ---------- presupuestos ---------- */
export function sembrar(bid) {
  db.transaction(() => {
    if (db.prepare('SELECT COUNT(*) AS n FROM categories WHERE budget_id = ?').get(bid).n === 0) {
      const ins = db.prepare('INSERT INTO categories (budget_id, kind, name, parent_id, color, sort) VALUES (?, ?, ?, ?, ?, ?)');
      CATEGORIAS.forEach((c, i) => {
        const { lastInsertRowid } = ins.run(bid, c.kind, c.name, null, c.color, i);
        c.subs.forEach((s, j) => ins.run(bid, c.kind, s, lastInsertRowid, c.color, j));
      });
    }
    if (db.prepare('SELECT COUNT(*) AS n FROM expense_types WHERE budget_id = ?').get(bid).n === 0) {
      const ins = db.prepare('INSERT INTO expense_types (budget_id, name, is_debt, sort) VALUES (?, ?, ?, ?)');
      TIPOS.forEach((t, i) => ins.run(bid, t.name, t.is_debt, i));
    }
    const set = db.prepare('INSERT OR IGNORE INTO settings (budget_id, key, value) VALUES (?, ?, ?)');
    set.run(bid, 'plan_start', JSON.stringify(mesActual()));
    set.run(bid, 'plan_end', JSON.stringify(finDePlanPorDefecto()));
  })();
}

export function crearPresupuesto(nombre = 'Presupuesto') {
  const id = Number(db.prepare('INSERT INTO budgets (name) VALUES (?)').run(nombre).lastInsertRowid);
  sembrar(id);
  return id;
}

/* ---------- lectura ---------- */
export function leerAjustes(bid) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings WHERE budget_id = ?').all(bid)) {
    if (!SETTING_KEYS.includes(r.key)) continue;
    try { out[r.key] = JSON.parse(r.value); } catch { /* valor corrupto: se ignora */ }
  }
  return out;
}

export function leerTodo(bid) {
  const categories = db.prepare('SELECT id, kind, name, parent_id, color, sort FROM categories WHERE budget_id = ? ORDER BY kind, sort, id').all(bid);
  const types = db.prepare('SELECT id, name, is_debt, sort FROM expense_types WHERE budget_id = ? ORDER BY sort, id').all(bid);
  const movements = db.prepare(`SELECT id, kind, name, amount, category_id, type_id, parent_id, start_month, end_month,
    every, notes, sort, updated_at FROM movements WHERE budget_id = ? ORDER BY sort, id`).all(bid);
  const overrides = db.prepare(`SELECT o.movement_id, o.month, o.amount FROM movement_overrides o
    JOIN movements m ON m.id = o.movement_id WHERE m.budget_id = ?`).all(bid);
  const porMov = new Map();
  for (const o of overrides) {
    if (!porMov.has(o.movement_id)) porMov.set(o.movement_id, {});
    porMov.get(o.movement_id)[o.month] = o.amount;
  }
  for (const m of movements) m.overrides = porMov.get(m.id) || {};
  const plan = {};
  for (const r of db.prepare('SELECT month, amount FROM savings_plan WHERE budget_id = ?').all(bid)) plan[r.month] = r.amount;
  return { categories, types, movements, plan, settings: leerAjustes(bid) };
}

/* ---------- copia de seguridad ---------- */
// Sustituye los datos de un presupuesto por los de una copia. Los identificadores
// de la copia se traducen a otros nuevos, para no chocar con otros presupuestos.
export function importarTodo(bid, data) {
  db.transaction(() => {
    for (const t of ['movements', 'categories', 'expense_types', 'savings_plan', 'settings']) {
      db.prepare(`DELETE FROM ${t} WHERE budget_id = ?`).run(bid);
    }
    const mapaCat = new Map(), mapaTipo = new Map(), mapaMov = new Map();
    const insCat = db.prepare('INSERT INTO categories (budget_id, kind, name, parent_id, color, sort) VALUES (?, ?, ?, ?, ?, ?)');
    const cats = [...data.categories].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
    for (const c of cats) {
      const r = insCat.run(bid, c.kind, c.name, c.parent_id != null ? (mapaCat.get(c.parent_id) ?? null) : null, c.color || 'c1', c.sort ?? 0);
      mapaCat.set(c.id, Number(r.lastInsertRowid));
    }
    const insTipo = db.prepare('INSERT INTO expense_types (budget_id, name, is_debt, sort) VALUES (?, ?, ?, ?)');
    for (const t of data.types) mapaTipo.set(t.id, Number(insTipo.run(bid, t.name, t.is_debt ? 1 : 0, t.sort ?? 0).lastInsertRowid));
    const insMov = db.prepare(`INSERT INTO movements (budget_id, kind, name, amount, category_id, type_id, parent_id, start_month, end_month, every, notes, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insOv = db.prepare('INSERT INTO movement_overrides (movement_id, month, amount) VALUES (?, ?, ?)');
    const pendientes = [...data.movements];
    let vueltas = 0;
    while (pendientes.length && vueltas++ < 50) {
      for (let i = pendientes.length - 1; i >= 0; i--) {
        const m = pendientes[i];
        if (m.parent_id != null && !mapaMov.has(m.parent_id)) continue;
        const r = insMov.run(bid, m.kind, m.name, m.amount, m.category_id != null ? (mapaCat.get(m.category_id) ?? null) : null,
          m.type_id != null ? (mapaTipo.get(m.type_id) ?? null) : null, m.parent_id != null ? mapaMov.get(m.parent_id) : null,
          m.start_month, m.end_month ?? null, m.every || 1, m.notes || '', m.sort ?? 0);
        const nuevo = Number(r.lastInsertRowid);
        mapaMov.set(m.id, nuevo);
        for (const [mes, imp] of Object.entries(m.overrides || {})) insOv.run(nuevo, mes, imp);
        pendientes.splice(i, 1);
      }
    }
    if (pendientes.length) throw new Error('Hay gastos que dependen de otros que no existen en la copia.');
    const insPlan = db.prepare('INSERT INTO savings_plan (budget_id, month, amount) VALUES (?, ?, ?)');
    for (const [mes, imp] of Object.entries(data.plan || {})) insPlan.run(bid, mes, imp);
    const insSet = db.prepare('INSERT INTO settings (budget_id, key, value) VALUES (?, ?, ?)');
    for (const k of SETTING_KEYS) if (data.settings && data.settings[k] !== undefined) insSet.run(bid, k, JSON.stringify(data.settings[k]));
  })();
  sembrar(bid);
}
