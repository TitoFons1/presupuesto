// Utilidades de interfaz: creación de nodos, formato de dinero y meses, avisos y diálogos.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [a, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (a === 'class') e.className = v;
    else if (a === 'text') e.textContent = v;
    else if (a === 'style') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) e.style.setProperty(p, val);
        else e.style[p] = val;
      }
    } else if (a.startsWith('on') && typeof v === 'function') e.addEventListener(a.slice(2), v);
    else if (a === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) e.value = v;
    else e.setAttribute(a, v === true ? '' : v);
  }
  anadir(e, kids);
  return e;
}
function anadir(e, k) {
  if (k == null || k === false) return;
  if (Array.isArray(k)) { k.forEach(x => anadir(e, x)); return; }
  e.append(k instanceof Node ? k : document.createTextNode(String(k)));
}

/* ---------- dinero (siempre en céntimos) ---------- */
const miles = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function eur(c, { signo = false } = {}) {
  c = Math.round(Number(c) || 0);
  const neg = c < 0, abs = Math.abs(c);
  const ent = miles(String(Math.floor(abs / 100))), dec = String(abs % 100).padStart(2, '0');
  return (neg ? '−' : signo && c > 0 ? '+' : '') + ent + ',' + dec + ' €';
}
export function eurCorto(c) {
  c = Math.round(Number(c) || 0);
  if (c % 100 !== 0) return eur(c);
  return (c < 0 ? '−' : '') + miles(String(Math.abs(c) / 100)) + ' €';
}
export function eurEntero(c) {
  const e = Math.round((Number(c) || 0) / 100);
  return (e < 0 ? '−' : '') + miles(String(Math.abs(e))) + ' €';
}
// Valor para un campo editable: "1.385,94" (parseEur lo vuelve a leer igual).
export function centATexto(c) {
  c = Math.round(Number(c) || 0);
  const neg = c < 0, abs = Math.abs(c);
  return (neg ? '-' : '') + miles(String(Math.floor(abs / 100))) + ',' + String(abs % 100).padStart(2, '0');
}
// "1.385,94", "1385.94", "27,28 €" → céntimos. NaN si no se entiende.
export function parseEur(s) {
  s = String(s ?? '').trim().replace(/[\s€ ]/g, '').replace('−', '-');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

/* ---------- meses "AAAA-MM" ---------- */
export const esMes = k => typeof k === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
export function sumarMeses(k, n) {
  let y = +k.slice(0, 4), m = +k.slice(5, 7) + n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}
export const difMeses = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
export function rango(a, b) {
  const out = [];
  for (let k = a; k <= b && out.length < 600; k = sumarMeses(k, 1)) out.push(k);
  return out;
}
export function mesHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const mi = k => +k.slice(5, 7) - 1;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const mesTitulo = k => `${cap(MESES[mi(k)])} ${k.slice(0, 4)}`;
export const mesLargo = k => `${MESES[mi(k)]} de ${k.slice(0, 4)}`;
export const mesCorto = k => `${MESES_C[mi(k)]} ${k.slice(0, 4)}`;
export const mesAbrev = k => MESES_C[mi(k)];

export function frecuenciaTexto(every) {
  return { 1: 'Cada mes', 2: 'Cada 2 meses', 3: 'Cada 3 meses', 4: 'Cada 4 meses', 6: 'Cada 6 meses', 12: 'Cada año' }[every] || 'Cada mes';
}

/* ---------- estado del mes ---------- */
export function estadoQueda(c) {
  if (c < 0) return { clase: 'mal', texto: 'No llegas' };
  if (c < 2500) return { clase: 'justo', texto: 'Muy justo' };
  return { clase: 'bien', texto: 'Con margen' };
}
export function pastilla(est) {
  return h('span', { class: 'pastilla ' + est.clase }, h('span', { class: 'punto', 'aria-hidden': 'true' }), est.texto);
}

/* ---------- almacenamiento local (solo preferencias) ---------- */
export function leerLocal(k) { try { return localStorage.getItem('presupuesto-' + k); } catch { return null; } }
export function guardarLocal(k, v) { try { localStorage.setItem('presupuesto-' + k, v); } catch { /* sin almacenamiento */ } }

/* ---------- avisos ---------- */
let temporizador = null;
export function aviso(texto, tipo = '') {
  const a = document.getElementById('aviso');
  a.textContent = texto;
  a.className = tipo;
  a.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { a.hidden = true; }, tipo === 'mal' ? 6000 : 3000);
}

/* ---------- diálogos ---------- */
const enfocables = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function dialogo({ titulo, cuerpo, clase = '' }) {
  const capa = document.getElementById('capa');
  const anterior = document.activeElement;
  const fkAnterior = anterior && anterior.dataset ? anterior.dataset.fk : null;
  const id = 'dlg-' + Math.random().toString(36).slice(2, 9);
  const caja = h('div', { class: 'dialogo ' + clase, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h('h2', { id, text: titulo }), cuerpo);
  const velo = h('div', { class: 'velo' }, caja);
  let cerrado = false;
  const alCerrar = [];
  function tecla(e) {
    if (capa.lastElementChild !== velo) return;
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (e.key !== 'Tab') return;
    const f = [...caja.querySelectorAll(enfocables)].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    velo.remove();
    document.removeEventListener('keydown', tecla, true);
    if (!capa.children.length) document.body.classList.remove('con-dialogo');
    alCerrar.forEach(f => f());
    if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
    else if (fkAnterior) { const n = document.querySelector(`[data-fk="${CSS.escape(fkAnterior)}"]`); if (n) n.focus({ preventScroll: true }); }
  }
  velo.addEventListener('mousedown', e => { if (e.target === velo) cerrar(); });
  document.addEventListener('keydown', tecla, true);
  capa.append(velo);
  document.body.classList.add('con-dialogo');
  requestAnimationFrame(() => {
    const f = caja.querySelector('[autofocus]') || caja.querySelector('input, select, textarea') || caja.querySelector('button');
    if (f) f.focus();
  });
  return { caja, cerrar, alCerrar: fn => alCerrar.push(fn) };
}

export function confirmar({ titulo, texto, boton = 'Eliminar', peligro = true }) {
  return new Promise(resolve => {
    let respuesta = false;
    const si = h('button', { type: 'button', class: 'boton ' + (peligro ? 'peligro' : 'principal'), text: boton });
    const no = h('button', { type: 'button', class: 'boton', text: 'Cancelar' });
    const d = dialogo({ titulo, clase: 'estrecho', cuerpo: [h('p', { class: 'texto-dialogo', text: texto }), h('div', { class: 'pie' }, h('div'), h('div', null, no, si))] });
    si.addEventListener('click', () => { respuesta = true; d.cerrar(); });
    no.addEventListener('click', () => d.cerrar());
    d.alCerrar(() => resolve(respuesta));
    requestAnimationFrame(() => no.focus());
  });
}

/* ---------- selects de meses ---------- */
export function rellenarMeses(select, meses, valor, extra) {
  const lista = [...meses];
  if (valor && !lista.includes(valor)) { lista.push(valor); lista.sort(); }
  select.replaceChildren(
    ...(extra ? [h('option', { value: extra[0], text: extra[1] })] : []),
    ...lista.map(k => h('option', { value: k, text: mesTitulo(k) })));
  select.value = valor ?? (extra ? extra[0] : lista[0]);
}
