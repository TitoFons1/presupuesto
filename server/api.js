import express from 'express';
import { db, leerTodo, importarTodo, leerAjustes, crearPresupuesto } from './db.js';
import { COLORES } from './defaults.js';
import {
  requireAuth, crearSesion, cerrarSesion, cerrarOtrasSesiones, usuarioDeSesion, hashPassword, verifyPassword,
  ipDe, bloqueado, registrarFallo, limpiarFallos, altas, modoRegistro, crearUsuario, mismoTexto, usuarioPublico,
} from './auth.js';

export const api = express.Router();

/* ---------- validación ---------- */
class ErrorDatos extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const fallo = (msg, status) => { throw new ErrorDatos(msg, status); };
const noExiste = msg => fallo(msg, 404);
const esMes = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const FRECUENCIAS = [1, 2, 3, 4, 6, 12];
const MAX_CENTIMOS = 100_000_000_00; // 100 millones de euros

function texto(v, campo, max, obligatorio = true) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (obligatorio && !s) fallo(`Falta ${campo}.`);
  if (s.length > max) fallo(`${campo[0].toUpperCase() + campo.slice(1)} no puede pasar de ${max} caracteres.`);
  return s;
}
function centimos(v, campo) {
  if (!Number.isInteger(v) || v < 0 || v > MAX_CENTIMOS) fallo(`${campo} no es un importe válido.`);
  return v;
}
function idOpcional(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fallo('Identificador no válido.');
  return n;
}
function kind(v) {
  if (v !== 'gasto' && v !== 'ingreso') fallo('El tipo debe ser «gasto» o «ingreso».');
  return v;
}
const idParam = req => { const n = Number(req.params.id); if (!Number.isInteger(n) || n <= 0) fallo('Identificador no válido.'); return n; };
function validarUsuario(username, password) {
  const u = texto(username, 'el usuario', 40);
  if (!/^[\p{L}\p{N}._@-]{3,40}$/u.test(u)) fallo('El usuario debe tener entre 3 y 40 letras, números o los signos . _ - @');
  if (typeof password !== 'string' || password.length < 8) fallo('La contraseña necesita al menos 8 caracteres.');
  if (password.length > 200) fallo('La contraseña es demasiado larga.');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)) fallo('Ya existe una cuenta con ese usuario. Elige otro.');
  return u;
}

/* ---------- sesión y registro ---------- */
api.get('/health', (req, res) => res.json({ ok: true }));

api.get('/config', (req, res) => res.json({ registro: modoRegistro() }));

api.post('/login', (req, res) => {
  const ip = ipDe(req);
  if (bloqueado(ip)) return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.' });
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const u = username ? db.prepare('SELECT id, username, password_hash, budget_id, prefs FROM users WHERE username = ?').get(username) : null;
  const ok = u ? verifyPassword(password, u.password_hash) : (verifyPassword(password, hashPassword('x')), false);
  if (!ok) {
    registrarFallo(ip);
    return res.status(401).json({ error: 'El usuario o la contraseña no son correctos.' });
  }
  limpiarFallos(ip);
  crearSesion(req, res, u.id);
  res.json({ user: usuarioPublico(u) });
});

// Registro: crea una cuenta con su propio presupuesto, vacío y con las categorías por defecto.
api.post('/register', (req, res) => {
  const modo = modoRegistro();
  if (modo === 'cerrado') fallo('El registro está desactivado en este servidor. Pide a quien lo administra que te dé acceso.', 403);
  const ip = ipDe(req);
  if (bloqueado(ip) || altas.bloqueado(ip)) return res.status(429).json({ error: 'Demasiados intentos desde tu conexión. Espera un rato y vuelve a probar.' });
  const b = req.body || {};
  if (modo === 'codigo' && !mismoTexto(String(b.codigo || '').trim(), process.env.REGISTRO_CODIGO.trim())) {
    registrarFallo(ip);
    fallo('El código de invitación no es correcto.', 403);
  }
  const username = validarUsuario(b.username, b.password);
  const user = db.transaction(() => {
    const bid = crearPresupuesto(`Presupuesto de ${username}`);
    const id = crearUsuario(username, b.password, bid);
    return db.prepare('SELECT id, username, prefs FROM users WHERE id = ?').get(id);
  })();
  altas.sumar(ip);
  crearSesion(req, res, user.id);
  res.status(201).json({ user: usuarioPublico(user) });
});

api.post('/logout', (req, res) => { cerrarSesion(req, res); res.json({ ok: true }); });

api.get('/me', (req, res) => {
  const user = usuarioDeSesion(req, res);
  if (!user) return res.status(401).json({ error: 'No has iniciado sesión.' });
  res.json({ user: { id: user.id, username: user.username, prefs: user.prefs } });
});

/* A partir de aquí, todo necesita sesión y se limita al presupuesto de la cuenta. */
api.use(requireAuth);

api.get('/data', (req, res) => res.json(leerTodo(req.user.budget_id)));

// Preferencias de la cuenta (por ahora, el tema), guardadas en el servidor.
api.put('/me/prefs', (req, res) => {
  const b = req.body || {};
  const prefs = { ...req.user.prefs };
  if (b.tema !== undefined) {
    if (!['sistema', 'light', 'dark'].includes(b.tema)) fallo('Tema no válido.');
    prefs.tema = b.tema;
  }
  db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.user.id);
  res.json({ prefs });
});

/* ---------- categorías ---------- */
function validarColor(c) { if (!COLORES.includes(c)) fallo('Color no válido.'); return c; }
const categoriaDe = (bid, id) => db.prepare('SELECT * FROM categories WHERE id = ? AND budget_id = ?').get(id, bid);

api.post('/categories', (req, res) => {
  const bid = req.user.budget_id, b = req.body || {};
  const k = kind(b.kind);
  const name = texto(b.name, 'el nombre', 60);
  const parent_id = idOpcional(b.parent_id);
  let color = b.color ? validarColor(b.color) : 'c1';
  if (parent_id) {
    const p = categoriaDe(bid, parent_id);
    if (!p) fallo('La categoría principal no existe.');
    if (p.parent_id) fallo('Una subcategoría no puede tener subcategorías.');
    if (p.kind !== k) fallo('La subcategoría debe ser del mismo tipo que su categoría.');
    color = p.color;
  }
  const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM categories WHERE budget_id = ? AND kind = ? AND parent_id IS ?').get(bid, k, parent_id).s;
  const r = db.prepare('INSERT INTO categories (budget_id, kind, name, parent_id, color, sort) VALUES (?, ?, ?, ?, ?, ?)').run(bid, k, name, parent_id, color, sort);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

api.put('/categories/:id', (req, res) => {
  const bid = req.user.budget_id, id = idParam(req), b = req.body || {};
  const c = categoriaDe(bid, id);
  if (!c) noExiste('La categoría no existe.');
  const name = texto(b.name ?? c.name, 'el nombre', 60);
  const color = b.color ? validarColor(b.color) : c.color;
  const sort = Number.isInteger(b.sort) ? b.sort : c.sort;
  db.transaction(() => {
    db.prepare('UPDATE categories SET name = ?, color = ?, sort = ? WHERE id = ? AND budget_id = ?').run(name, color, sort, id, bid);
    if (!c.parent_id && color !== c.color) db.prepare('UPDATE categories SET color = ? WHERE parent_id = ? AND budget_id = ?').run(color, id, bid);
  })();
  res.json({ ok: true });
});

api.delete('/categories/:id', (req, res) => {
  const r = db.prepare('DELETE FROM categories WHERE id = ? AND budget_id = ?').run(idParam(req), req.user.budget_id);
  if (!r.changes) noExiste('La categoría no existe.');
  res.json({ ok: true });
});

/* ---------- tipos de gasto ---------- */
api.post('/types', (req, res) => {
  const bid = req.user.budget_id, b = req.body || {};
  const name = texto(b.name, 'el nombre', 40);
  const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM expense_types WHERE budget_id = ?').get(bid).s;
  const r = db.prepare('INSERT INTO expense_types (budget_id, name, is_debt, sort) VALUES (?, ?, ?, ?)').run(bid, name, b.is_debt ? 1 : 0, sort);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

api.put('/types/:id', (req, res) => {
  const bid = req.user.budget_id, id = idParam(req), b = req.body || {};
  const t = db.prepare('SELECT * FROM expense_types WHERE id = ? AND budget_id = ?').get(id, bid);
  if (!t) noExiste('El tipo de gasto no existe.');
  const name = texto(b.name ?? t.name, 'el nombre', 40);
  const is_debt = b.is_debt === undefined ? t.is_debt : (b.is_debt ? 1 : 0);
  db.prepare('UPDATE expense_types SET name = ?, is_debt = ? WHERE id = ? AND budget_id = ?').run(name, is_debt, id, bid);
  res.json({ ok: true });
});

api.delete('/types/:id', (req, res) => {
  const r = db.prepare('DELETE FROM expense_types WHERE id = ? AND budget_id = ?').run(idParam(req), req.user.budget_id);
  if (!r.changes) noExiste('El tipo de gasto no existe.');
  res.json({ ok: true });
});

/* ---------- gastos e ingresos ---------- */
function validarMovimiento(bid, b, idActual = null) {
  const k = kind(b.kind);
  const name = texto(b.name, 'el concepto', 120);
  const amount = centimos(b.amount ?? 0, 'El importe');
  const category_id = idOpcional(b.category_id);
  if (category_id) {
    const c = categoriaDe(bid, category_id);
    if (!c) fallo('La categoría no existe.');
    if (c.kind !== k) fallo(k === 'gasto' ? 'Elige una categoría de gastos.' : 'Elige una categoría de ingresos.');
  }
  const type_id = k === 'gasto' ? idOpcional(b.type_id) : null;
  if (type_id && !db.prepare('SELECT 1 FROM expense_types WHERE id = ? AND budget_id = ?').get(type_id, bid)) fallo('El tipo de gasto no existe.');
  const parent_id = idOpcional(b.parent_id);
  if (parent_id) {
    if (parent_id === idActual) fallo('Un gasto no puede formar parte de sí mismo.');
    const p = db.prepare('SELECT id, kind, parent_id FROM movements WHERE id = ? AND budget_id = ?').get(parent_id, bid);
    if (!p) fallo('El gasto principal no existe.');
    if (p.kind !== k) fallo('Un gasto solo puede formar parte de otro gasto, y un ingreso de otro ingreso.');
    // Evita ciclos y limita la profundidad.
    let nivel = 1, actual = p;
    while (actual && actual.parent_id) {
      if (actual.parent_id === idActual) fallo('No puedes meter un gasto dentro de uno de sus propios subgastos.');
      actual = db.prepare('SELECT id, parent_id FROM movements WHERE id = ? AND budget_id = ?').get(actual.parent_id, bid);
      if (++nivel > 4) fallo('Como mucho se pueden anidar 5 niveles de gastos.');
    }
  }
  if (!esMes(b.start_month)) fallo('Elige el primer mes.');
  const end_month = b.end_month == null || b.end_month === '' ? null : b.end_month;
  if (end_month !== null && !esMes(end_month)) fallo('El último mes no es válido.');
  if (end_month && end_month < b.start_month) fallo('El último mes no puede ser anterior al primero.');
  const every = Number(b.every ?? 1);
  if (!FRECUENCIAS.includes(every)) fallo('La frecuencia no es válida.');
  const notes = texto(b.notes ?? '', 'la nota', 1000, false);
  const overrides = {};
  if (b.overrides && typeof b.overrides === 'object') {
    for (const [mes, imp] of Object.entries(b.overrides)) {
      if (!esMes(mes)) fallo('Hay un mes con importe especial que no es válido.');
      overrides[mes] = centimos(imp, `El importe de ${mes}`);
    }
  }
  return { kind: k, name, amount, category_id, type_id, parent_id, start_month: b.start_month, end_month, every, notes, overrides };
}

function guardarOverrides(id, overrides) {
  db.prepare('DELETE FROM movement_overrides WHERE movement_id = ?').run(id);
  const ins = db.prepare('INSERT INTO movement_overrides (movement_id, month, amount) VALUES (?, ?, ?)');
  for (const [mes, imp] of Object.entries(overrides)) ins.run(id, mes, imp);
}

api.post('/movements', (req, res) => {
  const bid = req.user.budget_id;
  const m = validarMovimiento(bid, req.body || {});
  const id = db.transaction(() => {
    const r = db.prepare(`INSERT INTO movements (budget_id, kind, name, amount, category_id, type_id, parent_id, start_month, end_month, every, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(bid, m.kind, m.name, m.amount, m.category_id, m.type_id, m.parent_id, m.start_month, m.end_month, m.every, m.notes);
    const nuevo = Number(r.lastInsertRowid);
    guardarOverrides(nuevo, m.overrides);
    return nuevo;
  })();
  res.status(201).json({ id });
});

api.put('/movements/:id', (req, res) => {
  const bid = req.user.budget_id, id = idParam(req);
  const actual = db.prepare('SELECT kind FROM movements WHERE id = ? AND budget_id = ?').get(id, bid);
  if (!actual) noExiste('Ese gasto ya no existe.');
  const m = validarMovimiento(bid, req.body || {}, id);
  if (m.kind !== actual.kind) {
    const hijos = db.prepare('SELECT COUNT(*) AS n FROM movements WHERE parent_id = ?').get(id).n;
    if (hijos) fallo('No puedes cambiar de gasto a ingreso algo que tiene subgastos.');
  }
  db.transaction(() => {
    db.prepare(`UPDATE movements SET kind = ?, name = ?, amount = ?, category_id = ?, type_id = ?, parent_id = ?, start_month = ?,
      end_month = ?, every = ?, notes = ?, updated_at = datetime('now') WHERE id = ? AND budget_id = ?`)
      .run(m.kind, m.name, m.amount, m.category_id, m.type_id, m.parent_id, m.start_month, m.end_month, m.every, m.notes, id, bid);
    guardarOverrides(id, m.overrides);
  })();
  res.json({ ok: true });
});

api.delete('/movements/:id', (req, res) => {
  const r = db.prepare('DELETE FROM movements WHERE id = ? AND budget_id = ?').run(idParam(req), req.user.budget_id);
  if (!r.changes) noExiste('Ese gasto ya no existe.');
  res.json({ ok: true });
});

/* ---------- plan de ahorro y ajustes ---------- */
api.put('/plan/:month', (req, res) => {
  if (!esMes(req.params.month)) fallo('El mes no es válido.');
  const amount = centimos(req.body?.amount, 'El ahorro');
  db.prepare(`INSERT INTO savings_plan (budget_id, month, amount) VALUES (?, ?, ?)
    ON CONFLICT(budget_id, month) DO UPDATE SET amount = excluded.amount`).run(req.user.budget_id, req.params.month, amount);
  res.json({ ok: true });
});

api.put('/settings', (req, res) => {
  const bid = req.user.budget_id, b = req.body || {};
  const cambios = {};
  const actuales = leerAjustes(bid);
  if (b.plan_start !== undefined || b.plan_end !== undefined) {
    const ini = b.plan_start ?? actuales.plan_start, fin = b.plan_end ?? actuales.plan_end;
    if (!esMes(ini) || !esMes(fin)) fallo('Los meses del plan no son válidos.');
    if (fin < ini) fallo('El plan no puede terminar antes de empezar.');
    const [y1, m1] = ini.split('-').map(Number), [y2, m2] = fin.split('-').map(Number);
    if ((y2 - y1) * 12 + (m2 - m1) > 59) fallo('El plan puede abarcar como mucho 5 años.');
    cambios.plan_start = ini; cambios.plan_end = fin;
  }
  if (b.hacienda !== undefined) {
    const h = b.hacienda || {};
    const year = Number(h.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) fallo('El año de la renta no es válido.');
    cambios.hacienda = { year, rit: centimos(h.rit ?? 0, 'El sueldo bruto'), ss: centimos(h.ss ?? 0, 'La Seguridad Social'), ret: centimos(h.ret ?? 0, 'Las retenciones'), otros: centimos(h.otros ?? 0, 'Lo cobrado de otras empresas') };
  }
  const up = db.prepare('INSERT INTO settings (budget_id, key, value) VALUES (?, ?, ?) ON CONFLICT(budget_id, key) DO UPDATE SET value = excluded.value');
  db.transaction(() => { for (const [k, v] of Object.entries(cambios)) up.run(bid, k, JSON.stringify(v)); })();
  res.json({ ok: true });
});

/* ---------- personas que comparten este presupuesto ---------- */
api.get('/users', (req, res) => {
  res.json({ users: db.prepare('SELECT id, username, created_at FROM users WHERE budget_id = ? ORDER BY id').all(req.user.budget_id) });
});

api.post('/users', (req, res) => {
  const b = req.body || {};
  const username = validarUsuario(b.username, b.password);
  const id = crearUsuario(username, b.password, req.user.budget_id);
  res.status(201).json({ id });
});

api.delete('/users/:id', (req, res) => {
  const bid = req.user.budget_id, id = idParam(req);
  if (id === req.user.id) fallo('No puedes quitarte el acceso a ti mismo mientras usas la cuenta.');
  const r = db.prepare('DELETE FROM users WHERE id = ? AND budget_id = ?').run(id, bid);
  if (!r.changes) noExiste('Esa cuenta no tiene acceso a tu presupuesto.');
  res.json({ ok: true });
});

api.put('/me/password', (req, res) => {
  const b = req.body || {};
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!u || !verifyPassword(String(b.current || ''), u.password_hash)) fallo('La contraseña actual no es correcta.');
  if (typeof b.password !== 'string' || b.password.length < 8) fallo('La contraseña nueva necesita al menos 8 caracteres.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.password), req.user.id);
  cerrarOtrasSesiones(req.user.id, req);
  res.json({ ok: true });
});

/* ---------- copia de seguridad ---------- */
api.get('/export', (req, res) => {
  const datos = leerTodo(req.user.budget_id);
  for (const m of datos.movements) delete m.updated_at;
  const hoy = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="presupuesto-${hoy}.json"`);
  res.json({ app: 'presupuesto', version: 1, exported_at: new Date().toISOString(), ...datos });
});

function validarCopia(d) {
  if (!d || d.app !== 'presupuesto' || d.version !== 1) fallo('El archivo no es una copia de este presupuesto.');
  const lista = (v, n) => { if (!Array.isArray(v)) fallo(`La copia no tiene ${n}.`); return v; };
  const idOk = v => Number.isInteger(v) && v > 0;
  const categories = lista(d.categories, 'categorías').map(c => {
    if (!idOk(c.id)) fallo('Hay una categoría sin identificador.');
    return { id: c.id, kind: kind(c.kind), name: texto(c.name, 'el nombre de una categoría', 60), parent_id: c.parent_id ?? null, color: COLORES.includes(c.color) ? c.color : 'c1', sort: Number.isInteger(c.sort) ? c.sort : 0 };
  });
  const catIds = new Set(categories.map(c => c.id));
  for (const c of categories) if (c.parent_id !== null && !catIds.has(c.parent_id)) fallo(`La subcategoría «${c.name}» apunta a una categoría que no está en la copia.`);
  const types = lista(d.types, 'tipos de gasto').map(t => {
    if (!idOk(t.id)) fallo('Hay un tipo de gasto sin identificador.');
    return { id: t.id, name: texto(t.name, 'el nombre de un tipo', 40), is_debt: t.is_debt ? 1 : 0, sort: Number.isInteger(t.sort) ? t.sort : 0 };
  });
  const typeIds = new Set(types.map(t => t.id));
  const movIds = new Set(lista(d.movements, 'movimientos').map(m => m.id));
  const movements = d.movements.map(m => {
    if (!idOk(m.id)) fallo('Hay un movimiento sin identificador.');
    if (!esMes(m.start_month)) fallo(`«${m.name}» no tiene un primer mes válido.`);
    if (m.end_month != null && (!esMes(m.end_month) || m.end_month < m.start_month)) fallo(`«${m.name}» tiene un último mes no válido.`);
    if (m.parent_id != null && !movIds.has(m.parent_id)) fallo(`«${m.name}» forma parte de un gasto que no está en la copia.`);
    const overrides = {};
    for (const [mes, imp] of Object.entries(m.overrides || {})) { if (esMes(mes)) overrides[mes] = centimos(imp, `El importe especial de «${m.name}»`); }
    return {
      id: m.id, kind: kind(m.kind), name: texto(m.name, 'el concepto', 120), amount: centimos(m.amount ?? 0, `El importe de «${m.name}»`),
      category_id: catIds.has(m.category_id) ? m.category_id : null, type_id: m.kind === 'gasto' && typeIds.has(m.type_id) ? m.type_id : null,
      parent_id: m.parent_id ?? null, start_month: m.start_month, end_month: m.end_month ?? null,
      every: FRECUENCIAS.includes(m.every) ? m.every : 1, notes: typeof m.notes === 'string' ? m.notes.slice(0, 1000) : '', sort: Number.isInteger(m.sort) ? m.sort : 0, overrides,
    };
  });
  const plan = {};
  for (const [mes, imp] of Object.entries(d.plan || {})) if (esMes(mes)) plan[mes] = centimos(imp, `El ahorro de ${mes}`);
  const settings = {};
  const s = d.settings || {};
  if (esMes(s.plan_start) && esMes(s.plan_end) && s.plan_end >= s.plan_start) { settings.plan_start = s.plan_start; settings.plan_end = s.plan_end; }
  if (s.hacienda && typeof s.hacienda === 'object') {
    const h = s.hacienda, n = v => (Number.isInteger(v) && v >= 0 ? v : 0);
    settings.hacienda = { year: Number.isInteger(h.year) ? h.year : new Date().getFullYear() - 1, rit: n(h.rit), ss: n(h.ss), ret: n(h.ret), otros: n(h.otros) };
  }
  return { categories, types, movements, plan, settings };
}

api.post('/import', (req, res) => {
  const datos = validarCopia(req.body);
  importarTodo(req.user.budget_id, datos);
  res.json({ ok: true, movimientos: datos.movements.length });
});

/* ---------- errores ---------- */
api.use((req, res) => res.status(404).json({ error: 'No existe esa ruta.' }));

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 5 MB).' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Los datos enviados no son JSON válido.' });
  if (err instanceof ErrorDatos) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Algo ha fallado en el servidor. Revisa los registros del contenedor.' });
}
