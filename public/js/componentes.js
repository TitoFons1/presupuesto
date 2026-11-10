// Piezas que se repiten en varias vistas.
import { h, mesTitulo, mesCorto, rellenarMeses, sumarMeses, frecuenciaTexto } from './ui.js';
import { mesesPlan, esCompuesto, esUnaVez, esDeuda, hijosDe, ultimoPago } from './calc.js';

export function cabecera(titulo, sub, ...acciones) {
  return h('div', { class: 'vista-cab' },
    h('div', { class: 'vista-tit' }, h('h1', { text: titulo }), sub ? h('p', { class: 'sub' }, sub) : null),
    acciones.length ? h('div', { class: 'acciones' }, acciones) : null);
}

export function selectorMes(ctx) {
  const ms = mesesPlan(ctx.I), i = ms.indexOf(ctx.mes);
  const sel = h('select', { class: 'mes-sel', 'aria-label': 'Mes', 'data-fk': 'sel-mes' });
  rellenarMeses(sel, ms, ctx.mes);
  sel.addEventListener('change', () => ctx.setMes(sel.value));
  return h('div', { class: 'selector-mes' },
    h('button', { type: 'button', class: 'icono', 'aria-label': 'Mes anterior', 'data-fk': 'mes-ant', disabled: i <= 0, onclick: () => ctx.setMes(sumarMeses(ctx.mes, -1)), text: '‹' }),
    sel,
    h('button', { type: 'button', class: 'icono', 'aria-label': 'Mes siguiente', 'data-fk': 'mes-sig', disabled: i >= ms.length - 1, onclick: () => ctx.setMes(sumarMeses(ctx.mes, 1)), text: '›' }));
}

export const muestra = color => h('span', { class: 'muestra ' + (color || 'c0'), 'aria-hidden': 'true' });

export function etiquetas(I, m, k) {
  const out = [];
  const n = hijosDe(I, m).length;
  if (n) out.push(['', n === 1 ? '1 subgasto' : `${n} subgastos`]);
  else if (esUnaVez(m)) out.push(['', 'Solo este mes']);
  else {
    if (esDeuda(I, m) && ultimoPago(m) === k) out.push(['fin', 'Último pago']);
    if (m.overrides && Object.prototype.hasOwnProperty.call(m.overrides, k)) out.push(['', 'Importe especial']);
    if (m.every > 1) out.push(['', frecuenciaTexto(m.every)]);
    if (m.end_month && ultimoPago(m) !== k && out.length < 2) out.push(['', 'Hasta ' + mesCorto(m.end_month)]);
  }
  return out.slice(0, 2).map(([c, t]) => h('span', { class: 'etiqueta ' + c, text: t }));
}

export function cuando(I, m) {
  if (esCompuesto(I, m)) return 'Según sus subgastos';
  if (esUnaVez(m)) return 'Solo en ' + mesCorto(m.start_month);
  const f = frecuenciaTexto(m.every);
  return m.end_month ? `${f}, de ${mesCorto(m.start_month)} a ${mesCorto(m.end_month)}` : `${f} desde ${mesCorto(m.start_month)}`;
}

export function vacio(texto, ...acciones) {
  return h('div', { class: 'vacio' }, h('p', { text: texto }), acciones.length ? h('div', { class: 'acciones' }, acciones) : null);
}

export const tituloMes = mesTitulo;
