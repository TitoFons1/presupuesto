import { h, eur, eurCorto, mesLargo, mesAbrev, mesCorto, mesTitulo, sumarMeses, estadoQueda, pastilla, rango } from '../ui.js';
import { resumen, mesesPlan, deudas, importeHoja, esCompuesto, esUnaVez, catRaiz, catDe } from '../calc.js';
import { selectorMes, muestra, vacio } from '../componentes.js';
import { columnas } from '../graficos.js';

const cifra = (c, clase = '') => h('span', { class: 'cifra ' + clase, text: eur(c) });

function frase(k, r) {
  const partes = ['En ', mesLargo(k)];
  if (r.ing) partes.push(' entran ', cifra(r.ing), ',');
  else partes.push(' no entra nada,');
  partes.push(' salen ', cifra(r.gas));
  if (r.ah) partes.push(' y apartas ', cifra(r.ah), ' para ahorrar.');
  else partes.push(' y no apartas nada para ahorrar.');
  if (r.queda >= 0) partes.push(' Te quedan ', cifra(r.queda, 'queda'), ' libres.');
  else partes.push(' Te faltan ', cifra(-r.queda, 'queda'), '.');
  return h('p', { class: 'frase' }, partes);
}

function agenda(I, desde) {
  const fin = sumarMeses(desde, 5);
  const ev = [];
  for (const d of deudas(I)) {
    if (d.fin && d.fin >= desde && d.fin <= fin) ev.push({ k: d.fin, texto: `Último pago de ${d.m.name}`, sub: `Desde ${mesLargo(sumarMeses(d.fin, 1))} tienes ${eur(d.libera)} más al mes`, cant: d.libera, clase: '' });
  }
  for (const m of I.datos.movements) {
    if (esCompuesto(I, m)) continue;
    const especial = esUnaVez(m) || m.every > 1;
    if (!especial) continue;
    for (const k of rango(desde, fin)) {
      const v = importeHoja(m, k);
      if (v < 5000) continue;
      const ingreso = m.kind === 'ingreso';
      ev.push({ k, texto: m.name, sub: ingreso ? 'Ingreso' : (catRaiz(I, catDe(I, m)) || {}).name || 'Gasto', cant: ingreso ? v : -v, clase: ingreso ? 'mas' : '' });
    }
  }
  ev.sort((a, b) => a.k.localeCompare(b.k) || Math.abs(b.cant) - Math.abs(a.cant));
  return ev.slice(0, 8);
}

export function render(main, ctx) {
  const I = ctx.I, k = ctx.mes;
  if (!I.datos.movements.length) {
    main.append(h('div', { class: 'vista-cab' }, h('div', { class: 'vista-tit' }, h('h1', { text: 'Tu presupuesto está vacío' }))),
      vacio('Empieza por lo que entra cada mes, como tu nómina, y por los gastos fijos, como el alquiler. Si ya tienes una copia, restáurala en Ajustes.',
        h('button', { type: 'button', class: 'boton principal', text: 'Añadir ingreso', onclick: () => ctx.abrirMovimiento({ kind: 'ingreso' }) }),
        h('button', { type: 'button', class: 'boton', text: 'Añadir gasto', onclick: () => ctx.abrirMovimiento({ kind: 'gasto' }) }),
        h('a', { class: 'boton sutil', href: '#/ajustes', text: 'Restaurar una copia' })));
    return;
  }
  const r = resumen(I, k), est = estadoQueda(r.queda), ms = mesesPlan(I);
  let acum = 0, acumHasta = 0;
  for (const x of ms) { acum += I.plan[x] || 0; if (x <= k) acumHasta = acum; }

  main.append(h('div', { class: 'vista-cab' }, h('div', { class: 'vista-tit' }, h('h1', { class: 'sr', text: 'Resumen de ' + mesLargo(k) })), selectorMes(ctx)));
  main.append(h('section', { class: 'portada', 'aria-label': 'Resumen del mes' },
    frase(k, r),
    h('div', { class: 'portada-pie' }, pastilla(est),
      h('p', { text: acum ? `Hasta ${mesLargo(k)} llevas ${eurCorto(acumHasta)} ahorrados según el plan. En ${mesLargo(ms.at(-1))} serán ${eurCorto(acum)}.` : 'Todavía no has puesto ahorro en el plan.' }),
      h('a', { class: 'enlace', href: '#/mes/' + k, text: 'Ver el detalle de ' + mesTitulo(k).split(' ')[0].toLowerCase() }))));

  const puntos = ms.map(x => {
    const rx = resumen(I, x);
    return { k: x, etiqueta: mesAbrev(x), etiquetaLarga: mesTitulo(x), valor: rx.queda, lineas: [`Te quedan ${eur(rx.queda)}`, `Entra ${eur(rx.ing)}`, `Sale ${eur(rx.gas)}`, `Ahorras ${eur(rx.ah)}`] };
  });
  main.append(h('section', { class: 'seccion' },
    h('div', { class: 'seccion-cab' }, h('h2', { text: 'Lo que te queda cada mes' }), h('p', { text: 'Después de pagarlo todo y apartar el ahorro. Toca un mes para verlo.' })),
    columnas(puntos, { sel: k, alElegir: x => ctx.setMes(x), descripcion: 'Dinero libre por mes' })));

  // Reparto por categoría
  const total = r.gas || 1;
  const filas = [...r.porCat.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => {
    const c = id ? I.cats.get(id) : null;
    const pct = Math.round((v / total) * 100);
    return h('li', null,
      h('span', { class: 'nombre' }, muestra(c ? c.color : 'c0'), c ? c.name : 'Sin categoría'),
      h('span', { class: 'cant' }, eur(v), h('span', { class: 'pct', text: pct + ' %' })),
      h('span', { class: 'pista ' + (c ? c.color : 'c0'), 'aria-hidden': 'true' }, h('span', { class: 'relleno', style: { width: Math.max(1, (v / total) * 100) + '%' } })));
  });
  const ev = agenda(I, k);
  main.append(h('div', { class: 'dos' },
    h('section', { class: 'seccion' },
      h('div', { class: 'seccion-cab' }, h('h2', { text: `Adónde va el dinero en ${mesLargo(k).split(' de ')[0]}` })),
      filas.length ? h('ul', { class: 'reparto' }, filas) : vacio('Este mes no tienes gastos.')),
    h('section', { class: 'seccion' },
      h('div', { class: 'seccion-cab' }, h('h2', { text: 'Lo que viene' }), h('p', { text: `De ${mesCorto(k)} a ${mesCorto(sumarMeses(k, 5))}` })),
      ev.length ? h('ol', { class: 'agenda' }, ev.map(e => h('li', null,
        h('span', { class: 'cuando', text: mesTitulo(e.k) }),
        h('span', { class: 'que' }, h('span', { text: e.texto }), h('span', { class: 'sub', text: e.sub })),
        h('span', { class: 'cuanto ' + e.clase, text: e.cant > 0 && e.clase === 'mas' ? eur(e.cant, { signo: true }) : eur(Math.abs(e.cant)) }))))
        : vacio('No hay pagas extra, pagos sueltos ni deudas que terminen en los próximos seis meses.'))));
}
