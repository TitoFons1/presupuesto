// Prueba de extremo a extremo de la API: arranca el servidor con una base de
// datos temporal y recorre inicio de sesión, gastos en cascada, plan e importación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presupuesto-test-'));
let srv, cookie = '';

async function pedir(metodo, ruta, cuerpo, { sinCabecera = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!sinCabecera) headers['X-Requested-With'] = 'presupuesto';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(BASE + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json };
}

before(async () => {
  srv = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, ADMIN_USER: 'prueba', ADMIN_PASSWORD: 'contraseña-larga' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch { /* aún arrancando */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('El servidor no arrancó');
});
after(() => { srv?.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows puede tener el archivo abierto */ } });

test('sin sesión no se ven datos', async () => {
  const r = await pedir('GET', '/api/data');
  assert.equal(r.status, 401);
});

test('rechaza contraseña incorrecta y acepta la buena', async () => {
  assert.equal((await pedir('POST', '/api/login', { username: 'prueba', password: 'mala' })).status, 401);
  const ok = await pedir('POST', '/api/login', { username: 'prueba', password: 'contraseña-larga' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.username, 'prueba');
});

test('las escrituras sin la cabecera de la app se rechazan', async () => {
  const r = await pedir('POST', '/api/types', { name: 'X' }, { sinCabecera: true });
  assert.equal(r.status, 403);
});

test('crea categorías por defecto, un gasto compuesto y sus subgastos', async () => {
  const d = (await pedir('GET', '/api/data')).json;
  assert.ok(d.categories.length > 5);
  assert.ok(d.types.some(t => t.is_debt));
  const viv = d.categories.find(c => c.name === 'Vivienda');
  const padre = await pedir('POST', '/api/movements', { kind: 'gasto', name: 'Suministros', amount: 0, category_id: viv.id, start_month: '2026-12', every: 1 });
  assert.equal(padre.status, 201);
  const luz = await pedir('POST', '/api/movements', { kind: 'gasto', name: 'Luz', amount: 2500, category_id: viv.id, parent_id: padre.json.id, start_month: '2026-12', every: 1 });
  assert.equal(luz.status, 201);
  // Un gasto no puede contenerse a sí mismo a través de un hijo.
  const ciclo = await pedir('PUT', `/api/movements/${padre.json.id}`, { kind: 'gasto', name: 'Suministros', amount: 0, parent_id: luz.json.id, start_month: '2026-12', every: 1 });
  assert.equal(ciclo.status, 400);
  // Borrar el padre borra en cascada.
  assert.equal((await pedir('DELETE', `/api/movements/${padre.json.id}`)).status, 200);
  const d2 = (await pedir('GET', '/api/data')).json;
  assert.equal(d2.movements.length, 0);
});

test('valida importes y meses', async () => {
  const r = await pedir('POST', '/api/movements', { kind: 'gasto', name: 'Mal', amount: 12.5, start_month: '2026-13', every: 1 });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /importe/i);
});

test('guarda plan y ajustes, exporta e importa', async () => {
  assert.equal((await pedir('PUT', '/api/plan/2027-03', { amount: 20000 })).status, 200);
  assert.equal((await pedir('PUT', '/api/settings', { plan_start: '2026-12', plan_end: '2027-12' })).status, 200);
  const copia = (await pedir('GET', '/api/export')).json;
  assert.equal(copia.plan['2027-03'], 20000);
  copia.movements.push({ id: 900, kind: 'gasto', name: 'Piso', amount: 40000, start_month: '2026-12', end_month: null, every: 1, overrides: { '2027-01': 0 } });
  const imp = await pedir('POST', '/api/import', copia);
  assert.equal(imp.status, 200);
  const d = (await pedir('GET', '/api/data')).json;
  assert.equal(d.movements[0].overrides['2027-01'], 0);
  assert.equal(d.settings.plan_end, '2027-12');
});

test('cerrar sesión impide seguir', async () => {
  await pedir('POST', '/api/logout', {});
  cookie = '';
  assert.equal((await pedir('GET', '/api/data')).status, 401);
});
