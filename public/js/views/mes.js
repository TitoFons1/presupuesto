import { h, eur, mesLargo, mesTitulo, estadoQueda, pastilla, parseEur, centATexto, aviso } from '../ui.js';
import { resumen, importe, hijosDe, catRaiz, catDe } from '../calc.js';
import { barraMes, muestra, etiquetas, vacio } from '../componentes.js';
import { api } from '../api.js';
import { fijarFiltro } from './listado.js';

const abiertos = new Set();

function fila(ctx, m, k, nivel) {
  const I = ctx.I, hs = hijosDe(ctx.I, m).filter(x => importe(I, x, k) > 0);
  const abierto = abiertos.has(m.id);
  const li = h('li', { class: 'fila' + (nivel ? ' hijo' : ''), style: { '--nivel': nivel } });
  const toggle = hs.length
    ? h('button', { type: 'button', class: 'plegar', 'aria-expanded': String(abierto), 'aria-label': (abierto ? 'Ocultar' : 'Mostrar') + ' los subgastos de ' + m.name, 'data-fk': 'pl-' + m.id,
      onclick: () => { if (abiertos.has(m.id)) abiertos.delete(m.id); else abiertos.add(m.id); ctx.repintar(); }, text: abierto ? '−' : '+' })
    : h('span', { class: 'plegar-hueco' });
  li.append(toggle, h('button', { type: 'button', class: 'cuerpo', 'data-fk': 'm-' + m.id, onclick: () => ctx.abrirMovimiento({ id: m.id, mes: k }) },
    h('span', { class: 'nombre' }, h('span', { text: m.name }), etiquetas(I, m, k)),
    h('span', { class: 'importe', text: eur(importe(I, m, k)) })));
  const out = [li];
  if (abierto) for (const x of hs) out.push(...fila(ctx, x, k, nivel + 1));
  return out;
}

function listaAgrupada(ctx, kind, k) {
  const I = ctx.I;
  const raices = I.raices.filter(m => m.kind === kind && importe(I, m, k) > 0);
  if (!raices.length) return null;
  const grupos = new Map();
  for (const m of raices) {
    const c = catRaiz(I, catDe(I, m));
    const clave = c ? c.id : 0;
    if (!grupos.has(clave)) grupos.set(clave, { c, items: [] });
    grupos.get(clave).items.push(m);
  }
  const orden = [...grupos.values()].sort((a, b) => (a.c ? a.c.sort : 999) - (b.c ? b.c.sort : 999));
  return orden.map(g => {
    const items = g.items.sort((a, b) => importe(I, b, k) - importe(I, a, k));
    const total = items.reduce((s, m) => s + importe(I, m, k), 0);
    const nombre = g.c ? g.c.name : 'Sin categoría';
    const ver = () => { fijarFiltro(kind, { cat: g.c ? String(g.c.id) : '' }); ctx.irA(kind === 'gasto' ? '#/gastos' : '#/ingresos'); };
    return h('div', { class: 'grupo' },
      h('div', { class: 'grupo-cab' }, muestra(g.c ? g.c.color : 'c0'),
        h('button', { type: 'button', class: 'grupo-nom', onclick: ver, 'aria-label': `${nombre}: ver todos en ${kind === 'gasto' ? 'Gastos' : 'Ingresos'}`, text: nombre }),
        h('span', { class: 'total', text: eur(total) })),
      h('ul', { class: 'filas' }, items.flatMap(m => fila(ctx, m, k, 0))));
  });
}

export function render(main, ctx) {
  const I = ctx.I, k = ctx.mes, r = resumen(I, k), est = estadoQueda(r.queda);
  main.append(h('div', { class: 'vista-cab cab-mes' },
    h('h1', { class: 'sr', text: mesTitulo(k) }),
    barraMes(ctx), pastilla(est)));

  const inAh = h('input', { type: 'text', inputmode: 'decimal', id: 'ahorro-mes', 'data-fk': 'ahorro-mes', autocomplete: 'off', value: centATexto(r.ah), 'aria-describedby': 'ahorro-ayuda' });
  inAh.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inAh.blur(); } });
  inAh.addEventListener('change', async () => {
    const v = parseEur(inAh.value);
    if (!Number.isFinite(v) || v < 0) { inAh.setAttribute('aria-invalid', 'true'); aviso('Escribe una cantidad, por ejemplo 250.', 'mal'); return; }
    try { await api('PUT', `/plan/${k}`, { amount: v }); aviso(`Ahorro de ${mesLargo(k)} guardado`); await ctx.recargar(); }
    catch (e) { aviso(e.message, 'mal'); }
  });
  main.append(h('section', { class: 'libro', 'aria-label': 'Cuentas del mes' },
    h('div', null, h('span', { class: 'etq', text: 'Entra' }), h('span', { class: 'valor', text: eur(r.ing) })),
    h('div', null, h('span', { class: 'etq', text: 'Sale' }), h('span', { class: 'valor', text: eur(r.gas) })),
    h('div', null, h('label', { class: 'etq', for: 'ahorro-mes', text: 'Ahorras' }), inAh, h('span', { class: 'sr', id: 'ahorro-ayuda', text: 'Escribe cuánto apartas este mes y pulsa Intro.' })),
    h('div', { class: 'queda ' + est.clase }, h('span', { class: 'etq', text: 'Te queda' }), h('span', { class: 'valor', text: eur(r.queda) }))));

  if (r.queda < 0) main.append(h('p', { class: 'alerta mal', text: `Este mes no llegas: te faltan ${eur(-r.queda)}. Baja el ahorro o recorta algún gasto.` }));
  else if (r.ing > 0 && r.queda < 2500) main.append(h('p', { class: 'alerta', text: `Mes muy justo: después de pagarlo todo y ahorrar te quedan ${eur(r.queda)} para imprevistos.` }));

  const gastos = listaAgrupada(ctx, 'gasto', k), ingresos = listaAgrupada(ctx, 'ingreso', k);
  main.append(h('div', { class: 'dos mes-dos' },
    h('section', { class: 'seccion' },
      h('div', { class: 'seccion-cab' }, h('h2', { text: 'Gastos' }), h('button', { type: 'button', class: 'boton peque solo-escritorio', text: 'Añadir gasto', onclick: () => ctx.abrirMovimiento({ kind: 'gasto', mes: k }) })),
      gastos || vacio('No hay gastos en ' + mesLargo(k) + '.')),
    h('section', { class: 'seccion' },
      h('div', { class: 'seccion-cab' }, h('h2', { text: 'Ingresos' }), h('button', { type: 'button', class: 'boton peque solo-escritorio', text: 'Añadir ingreso', onclick: () => ctx.abrirMovimiento({ kind: 'ingreso', mes: k }) })),
      ingresos || vacio('No hay ingresos en ' + mesLargo(k) + '. Añade tu nómina para empezar.'))));
}
