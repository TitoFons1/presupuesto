// Cálculos del presupuesto. Todo en céntimos.
import { sumarMeses, difMeses, rango, mesHoy } from './ui.js';

const porNombre = (a, b) => a.name.localeCompare(b.name, 'es');
const tiene = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

export function indexar(datos) {
  const movs = new Map(datos.movements.map(m => [m.id, m]));
  const hijos = new Map();
  for (const m of datos.movements) {
    if (m.parent_id != null && movs.has(m.parent_id)) {
      if (!hijos.has(m.parent_id)) hijos.set(m.parent_id, []);
      hijos.get(m.parent_id).push(m);
    }
  }
  for (const l of hijos.values()) l.sort(porNombre);
  const raices = datos.movements.filter(m => m.parent_id == null || !movs.has(m.parent_id)).sort(porNombre);
  const cats = new Map(datos.categories.map(c => [c.id, c]));
  const subcats = new Map();
  for (const c of datos.categories) {
    if (c.parent_id != null) {
      if (!subcats.has(c.parent_id)) subcats.set(c.parent_id, []);
      subcats.get(c.parent_id).push(c);
    }
  }
  for (const l of subcats.values()) l.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'es'));
  const catsRaiz = kind => datos.categories.filter(c => c.kind === kind && c.parent_id == null).sort((a, b) => a.sort - b.sort || a.id - b.id);
  const tipos = new Map(datos.types.map(t => [t.id, t]));
  return { datos, movs, hijos, raices, cats, subcats, catsRaiz, tipos, plan: datos.plan || {}, ajustes: datos.settings || {} };
}

export const hijosDe = (I, m) => I.hijos.get(m.id) || [];
export const esCompuesto = (I, m) => hijosDe(I, m).length > 0;
export const esUnaVez = m => !!m.end_month && m.end_month === m.start_month;

export function importeHoja(m, k) {
  if (k < m.start_month) return 0;
  if (m.end_month && k > m.end_month) return 0;
  if (m.every > 1 && difMeses(m.start_month, k) % m.every !== 0) return 0;
  return tiene(m.overrides, k) ? m.overrides[k] : m.amount;
}

export function importe(I, m, k) {
  const hs = I.hijos.get(m.id);
  if (hs && hs.length) { let s = 0; for (const x of hs) s += importe(I, x, k); return s; }
  return importeHoja(m, k);
}

export function hojas(I, m, out = []) {
  const hs = I.hijos.get(m.id);
  if (hs && hs.length) hs.forEach(x => hojas(I, x, out)); else out.push(m);
  return out;
}

export function descendientes(I, id, out = new Set()) {
  for (const x of I.hijos.get(id) || []) { out.add(x.id); descendientes(I, x.id, out); }
  return out;
}

export function nivelDe(I, m) {
  let n = 0, x = m;
  while (x && x.parent_id != null && I.movs.has(x.parent_id)) { n++; x = I.movs.get(x.parent_id); }
  return n;
}

// La categoría y el tipo se heredan del gasto principal si el subgasto no tiene.
export function catDe(I, m) {
  for (let x = m; x; x = x.parent_id != null ? I.movs.get(x.parent_id) : null) {
    if (x.category_id != null && I.cats.has(x.category_id)) return I.cats.get(x.category_id);
  }
  return null;
}
export const catRaiz = (I, c) => (c && c.parent_id != null ? I.cats.get(c.parent_id) || c : c);
export function tipoDe(I, m) {
  for (let x = m; x; x = x.parent_id != null ? I.movs.get(x.parent_id) : null) {
    if (x.type_id != null && I.tipos.has(x.type_id)) return I.tipos.get(x.type_id);
  }
  return null;
}
export const esDeuda = (I, m) => !!(tipoDe(I, m) || {}).is_debt;

export function mesesPlan(I) {
  const a = I.ajustes;
  const ini = a.plan_start || mesHoy();
  const fin = a.plan_end && a.plan_end >= ini ? a.plan_end : sumarMeses(ini, 12);
  return rango(ini, fin);
}

export function resumen(I, k) {
  let ing = 0, gas = 0;
  for (const m of I.raices) {
    const v = importe(I, m, k);
    if (!v) continue;
    if (m.kind === 'ingreso') ing += v; else gas += v;
  }
  const porCat = new Map();
  for (const m of I.datos.movements) {
    if (m.kind !== 'gasto' || esCompuesto(I, m)) continue;
    const v = importeHoja(m, k);
    if (!v) continue;
    const c = catRaiz(I, catDe(I, m));
    const clave = c ? c.id : 0;
    porCat.set(clave, (porCat.get(clave) || 0) + v);
  }
  const ah = I.plan[k] || 0;
  return { ing, gas, ah, disp: ing - gas, queda: ing - gas - ah, porCat };
}

export function ultimoPago(m) {
  if (!m.end_month) return null;
  if (m.every <= 1) return m.end_month;
  const d = difMeses(m.start_month, m.end_month);
  return sumarMeses(m.start_month, d - (d % m.every));
}

export function deudas(I) {
  const hoy = mesHoy();
  const out = [];
  for (const m of I.datos.movements) {
    if (m.kind !== 'gasto' || esCompuesto(I, m) || !esDeuda(I, m)) continue;
    const fin = ultimoPago(m);
    let cuotas = 0, total = 0;
    if (fin) {
      const ini = m.start_month > hoy ? m.start_month : hoy;
      if (ini <= fin) for (const k of rango(ini, fin)) { const v = importeHoja(m, k); if (v > 0) { cuotas++; total += v; } }
    }
    out.push({ m, fin, cuotas, total, libera: fin ? importeHoja(m, fin) : 0 });
  }
  return out.sort((a, b) => (a.fin || '9999-99').localeCompare(b.fin || '9999-99') || b.m.amount - a.m.amount);
}

// Lista plana (con nivel) de los movimientos de un tipo, para elegir el gasto principal.
export function arbolPlano(I, kind, excluir = new Set()) {
  const out = [];
  const recorrer = (lista, nivel) => {
    for (const m of lista) {
      if (m.kind !== kind || excluir.has(m.id)) continue;
      out.push({ m, nivel });
      recorrer(I.hijos.get(m.id) || [], nivel + 1);
    }
  };
  recorrer(I.raices, 0);
  return out;
}

/* ---------- renta (IRPF) ----------
   Estimación: escala estatal + escala de Aragón, mínimo personal 5.550 €,
   2.000 € de gastos generales y reducción por rendimientos del trabajo. */
const ESC_EST = [[12450, 0.095], [20200, 0.12], [35200, 0.15], [60000, 0.185], [300000, 0.225], [Infinity, 0.245]];
const ESC_ARA = [[13072.5, 0.095], [21210, 0.12], [36960, 0.15], [52500, 0.185], [60000, 0.205], [80000, 0.23], [90000, 0.24], [130000, 0.25], [Infinity, 0.255]];
function escala(base, esc) {
  let prev = 0, c = 0;
  for (const [lim, t] of esc) { if (base <= prev) break; c += (Math.min(base, lim) - prev) * t; prev = lim; }
  return c;
}
export function renta(hc) {
  const e = c => (Number(c) || 0) / 100;
  const rit = e(hc.rit), ss = e(hc.ss), ret = e(hc.ret), otros = e(hc.otros);
  const previo = Math.max(0, rit - ss);
  let red = 0;
  if (previo <= 14852) red = 7302;
  else if (previo <= 17673.52) red = 7302 - 1.75 * (previo - 14852);
  else if (previo <= 19747.5) red = 2364.34 - 1.14 * (previo - 17673.52);
  const gastos = Math.min(2000, previo);
  red = Math.max(0, Math.min(red, previo - gastos));
  const base = Math.max(0, previo - gastos - red);
  const minimo = Math.min(5550, base);
  const cEst = Math.max(0, escala(base, ESC_EST) - escala(minimo, ESC_EST));
  const cAut = Math.max(0, escala(base, ESC_ARA) - escala(minimo, ESC_ARA));
  const c = x => Math.round(x * 100);
  const cuota = c(cEst) + c(cAut);
  const limite = otros > 1500 ? 15876 : 22000;
  return { rit: c(rit), ss: c(ss), ret: c(ret), gastos: c(gastos), red: c(red), base: c(base), cEst: c(cEst), cAut: c(cAut), cuota, res: cuota - c(ret), limite: c(limite), obligado: rit > limite };
}
