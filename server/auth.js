import crypto from 'node:crypto';
import { db, crearPresupuesto, sembrar } from './db.js';

const COOKIE = 'presupuesto_sesion';
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const RENOVAR_MS = 15 * 24 * 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const esperado = Buffer.from(hashB64, 'base64');
  const calc = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), esperado.length, { N: +N, r: +r, p: +p });
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

const sha256 = t => crypto.createHash('sha256').update(t).digest('hex');
export const mismoTexto = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(String(a))), Buffer.from(sha256(String(b))));

function leerCookie(req, nombre) {
  const raw = req.headers.cookie || '';
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function cookieSegura(req) {
  const modo = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
  if (modo === 'true') return true;
  if (modo === 'false') return false;
  return req.secure;
}

function escribirCookie(req, res, valor, maxAgeMs) {
  const partes = [`${COOKIE}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (cookieSegura(req)) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

export function crearSesion(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ahora = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, ahora, ahora + DURACION_MS);
  escribirCookie(req, res, token, DURACION_MS);
}

export function cerrarSesion(req, res) {
  const token = leerCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  escribirCookie(req, res, '', 0);
}

export function cerrarOtrasSesiones(userId, req) {
  const token = leerCookie(req, COOKIE);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, token ? sha256(token) : '');
}

const leerPrefs = t => { try { const p = JSON.parse(t || '{}'); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
export const usuarioPublico = u => ({ id: u.id, username: u.username, prefs: leerPrefs(u.prefs) });

export function usuarioDeSesion(req, res) {
  const token = leerCookie(req, COOKIE);
  if (!token) return null;
  const h = sha256(token);
  const fila = db.prepare(`SELECT s.expires_at, u.id, u.username, u.budget_id, u.prefs FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(h);
  if (!fila || fila.budget_id == null) return null;
  const ahora = Date.now();
  if (fila.expires_at < ahora) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
    return null;
  }
  if (fila.expires_at - ahora < RENOVAR_MS) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(ahora + DURACION_MS, h);
    escribirCookie(req, res, token, DURACION_MS);
  }
  return { id: fila.id, username: fila.username, budget_id: fila.budget_id, prefs: leerPrefs(fila.prefs) };
}

export function requireAuth(req, res, next) {
  const user = usuarioDeSesion(req, res);
  if (!user) return res.status(401).json({ error: 'Tu sesión ha terminado. Vuelve a entrar.' });
  req.user = user;
  next();
}

// Las peticiones que cambian datos deben llevar esta cabecera. Un formulario
// de otra web no puede añadirla sin permiso CORS, que esta app no concede.
export function requireAppHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'presupuesto') return res.status(403).json({ error: 'Petición no permitida.' });
  next();
}

/* ---------- límites por IP ---------- */
function limitador(max, ventanaMs) {
  const mapa = new Map();
  return {
    bloqueado(ip) {
      const e = mapa.get(ip);
      if (!e) return false;
      if (Date.now() - e.desde > ventanaMs) { mapa.delete(ip); return false; }
      return e.n >= max;
    },
    sumar(ip) {
      const e = mapa.get(ip);
      if (!e || Date.now() - e.desde > ventanaMs) mapa.set(ip, { n: 1, desde: Date.now() });
      else e.n++;
    },
    limpiar(ip) { mapa.delete(ip); },
  };
}
const fallosLogin = limitador(8, 15 * 60 * 1000);
export const altas = limitador(5, 60 * 60 * 1000); // como mucho 5 cuentas nuevas por IP y hora
export const ipDe = req => req.get('CF-Connecting-IP') || req.ip || 'desconocida';
export const bloqueado = ip => fallosLogin.bloqueado(ip);
export const registrarFallo = ip => fallosLogin.sumar(ip);
export const limpiarFallos = ip => fallosLogin.limpiar(ip);

export function limpiarSesionesCaducadas() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

/* ---------- registro ---------- */
// REGISTRO=abierto   cualquiera con el enlace puede crearse una cuenta
// REGISTRO=codigo    hace falta el código de REGISTRO_CODIGO (por defecto)
// REGISTRO=cerrado   nadie puede registrarse; solo se dan accesos desde Ajustes
export function modoRegistro() {
  const modo = (process.env.REGISTRO || 'codigo').toLowerCase();
  if (modo === 'abierto') return 'abierto';
  if (modo === 'codigo' && (process.env.REGISTRO_CODIGO || '').trim()) return 'codigo';
  return 'cerrado';
}

export function crearUsuario(username, password, budgetId) {
  return Number(db.prepare('INSERT INTO users (username, password_hash, budget_id) VALUES (?, ?, ?)').run(username, hashPassword(password), budgetId).lastInsertRowid);
}

// Crea la primera cuenta si no hay ninguna.
export function asegurarAdmin() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (n > 0) return;
  const usuario = (process.env.ADMIN_USER || 'admin').trim();
  let password = process.env.ADMIN_PASSWORD || '';
  let generada = false;
  if (password.length < 8) {
    password = crypto.randomBytes(12).toString('base64url');
    generada = true;
  }
  const existente = db.prepare('SELECT id FROM budgets ORDER BY id LIMIT 1').get();
  const bid = existente ? existente.id : crearPresupuesto();
  sembrar(bid);
  crearUsuario(usuario, password, bid);
  if (generada) {
    console.log('==========================================================');
    console.log(' Primera cuenta creada');
    console.log(`   Usuario:    ${usuario}`);
    console.log(`   Contraseña: ${password}`);
    console.log(' Cámbiala en Ajustes después de entrar.');
    console.log('==========================================================');
  } else {
    console.log(`Primera cuenta creada para «${usuario}» con la contraseña de ADMIN_PASSWORD.`);
  }
}
