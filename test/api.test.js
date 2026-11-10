// Prueba de extremo a extremo de la API: arranca el servidor con una base de
// datos temporal y recorre inicio de sesión, registro, presupuestos separados,
// gastos en cascada, plan e importación.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presupuesto-test-'));
let srv;

// Cada «sesión» guarda su propia cookie, como dos navegadores distintos.
function sesion() {
  let cookie = '';
  return async function pedir(metodo, ruta, cuerpo, { sinCabecera = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (!sinCabecera) headers['X-Requested-With'] = 'presupuesto';
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(BASE + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
    return { status: r.status, json };
  };
}
const admin = sesion();
const ana = sesion();

before(async () => {
  srv = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, ADMIN_USER: 'prueba', ADMIN_PASSWORD: 'contraseña-larga', REGISTRO: 'codigo', REGISTRO_CODIGO: 'invita-123' },
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
  const r = await admin('GET', '/api/data');
  assert.equal(r.status, 401);
});

test('rechaza contraseña incorrecta y acepta la buena', async () => {
  assert.equal((await admin('POST', '/api/login', { username: 'prueba', password: 'mala' })).status, 401);
  const ok = await admin('POST', '/api/login', { username: 'prueba', password: 'contraseña-larga' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.username, 'prueba');
});

test('las escrituras sin la cabecera de la app se rechazan', async () => {
  const r = await admin('POST', '/api/types', { name: 'X' }, { sinCabecera: true });
  assert.equal(r.status, 403);
});

test('crea categorías por defecto, un gasto compuesto y sus subgastos', async () => {
  const d = (await admin('GET', '/api/data')).json;
  assert.ok(d.categories.length > 5);
  assert.ok(d.types.some(t => t.is_debt));
  const viv = d.categories.find(c => c.name === 'Vivienda');
  const padre = await admin('POST', '/api/movements', { kind: 'gasto', name: 'Suministros', amount: 0, category_id: viv.id, start_month: '2026-12', every: 1 });
  assert.equal(padre.status, 201);
  const luz = await admin('POST', '/api/movements', { kind: 'gasto', name: 'Luz', amount: 2500, category_id: viv.id, parent_id: padre.json.id, start_month: '2026-12', every: 1 });
  assert.equal(luz.status, 201);
  const ciclo = await admin('PUT', `/api/movements/${padre.json.id}`, { kind: 'gasto', name: 'Suministros', amount: 0, parent_id: luz.json.id, start_month: '2026-12', every: 1 });
  assert.equal(ciclo.status, 400);
  assert.equal((await admin('DELETE', `/api/movements/${padre.json.id}`)).status, 200);
  assert.equal((await admin('GET', '/api/data')).json.movements.length, 0);
});

test('valida importes y meses', async () => {
  const r = await admin('POST', '/api/movements', { kind: 'gasto', name: 'Mal', amount: 12.5, start_month: '2026-13', every: 1 });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /importe/i);
});

test('guarda plan y ajustes, exporta e importa', async () => {
  assert.equal((await admin('PUT', '/api/plan/2027-03', { amount: 20000 })).status, 200);
  assert.equal((await admin('PUT', '/api/settings', { plan_start: '2026-12', plan_end: '2027-12' })).status, 200);
  const copia = (await admin('GET', '/api/export')).json;
  assert.equal(copia.plan['2027-03'], 20000);
  copia.movements.push({ id: 900, kind: 'gasto', name: 'Piso', amount: 40000, start_month: '2026-12', end_month: null, every: 1, overrides: { '2027-01': 0 } });
  assert.equal((await admin('POST', '/api/import', copia)).status, 200);
  const d = (await admin('GET', '/api/data')).json;
  assert.equal(d.movements[0].name, 'Piso');
  assert.equal(d.movements[0].overrides['2027-01'], 0);
  assert.equal(d.settings.plan_end, '2027-12');
});

test('el registro exige el código de invitación', async () => {
  assert.equal((await ana('GET', '/api/config')).json.registro, 'codigo');
  const sin = await ana('POST', '/api/register', { username: 'ana', password: 'otra-contraseña', codigo: 'mal' });
  assert.equal(sin.status, 403);
  const corta = await ana('POST', '/api/register', { username: 'ana', password: 'corta', codigo: 'invita-123' });
  assert.equal(corta.status, 400);
  const repetido = await ana('POST', '/api/register', { username: 'PRUEBA', password: 'otra-contraseña', codigo: 'invita-123' });
  assert.equal(repetido.status, 400);
  const ok = await ana('POST', '/api/register', { username: 'ana', password: 'otra-contraseña', codigo: 'invita-123' });
  assert.equal(ok.status, 201);
  assert.equal((await ana('GET', '/api/me')).json.user.username, 'ana');
});

test('cada cuenta registrada tiene su propio presupuesto', async () => {
  const dAna = (await ana('GET', '/api/data')).json;
  assert.equal(dAna.movements.length, 0, 'Ana no ve los gastos de otro presupuesto');
  assert.ok(dAna.categories.length > 5, 'Ana empieza con las categorías por defecto');
  assert.deepEqual(dAna.plan, {});
  const dAdmin = (await admin('GET', '/api/data')).json;
  const piso = dAdmin.movements[0];
  const catAdmin = dAdmin.categories[0];
  // Ana no puede tocar nada del otro presupuesto, aunque adivine los identificadores.
  assert.equal((await ana('PUT', `/api/movements/${piso.id}`, { kind: 'gasto', name: 'Hackeado', amount: 1, start_month: '2026-12', every: 1 })).status, 404);
  assert.equal((await ana('DELETE', `/api/movements/${piso.id}`)).status, 404);
  assert.equal((await ana('DELETE', `/api/categories/${catAdmin.id}`)).status, 404);
  assert.equal((await ana('POST', '/api/movements', { kind: 'gasto', name: 'X', amount: 1, category_id: catAdmin.id, start_month: '2026-12', every: 1 })).status, 400);
  assert.equal((await ana('POST', '/api/movements', { kind: 'gasto', name: 'X', amount: 1, parent_id: piso.id, start_month: '2026-12', every: 1 })).status, 400);
  assert.equal((await admin('GET', '/api/data')).json.movements[0].name, 'Piso');
  // Lo que Ana guarda solo lo ve Ana.
  assert.equal((await ana('POST', '/api/movements', { kind: 'gasto', name: 'Cine', amount: 900, start_month: '2026-12', every: 1 })).status, 201);
  assert.equal((await ana('PUT', '/api/plan/2027-01', { amount: 5000 })).status, 200);
  assert.ok(!(await admin('GET', '/api/data')).json.movements.some(m => m.name === 'Cine'));
  assert.equal((await admin('GET', '/api/data')).json.plan['2027-01'], undefined);
  // Cada uno solo ve a las personas de su presupuesto.
  assert.deepEqual((await ana('GET', '/api/users')).json.users.map(u => u.username), ['ana']);
  assert.ok(!(await admin('GET', '/api/users')).json.users.some(u => u.username === 'ana'));
});

test('una persona añadida desde Ajustes comparte el presupuesto', async () => {
  assert.equal((await admin('POST', '/api/users', { username: 'pareja', password: 'compartida-123' })).status, 201);
  const pareja = sesion();
  assert.equal((await pareja('POST', '/api/login', { username: 'pareja', password: 'compartida-123' })).status, 200);
  assert.equal((await pareja('GET', '/api/data')).json.movements[0].name, 'Piso');
});

test('el tema se guarda con la cuenta', async () => {
  assert.equal((await ana('PUT', '/api/me/prefs', { tema: 'dark' })).status, 200);
  const otra = sesion();
  const r = await otra('POST', '/api/login', { username: 'ana', password: 'otra-contraseña' });
  assert.equal(r.json.user.prefs.tema, 'dark');
  assert.equal((await ana('PUT', '/api/me/prefs', { tema: 'rosa' })).status, 400);
});

test('cerrar sesión impide seguir', async () => {
  await admin('POST', '/api/logout', {});
  assert.equal((await admin('GET', '/api/data')).status, 401);
});
