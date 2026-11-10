import { h, eur, mesLargo, mesTitulo, mesAbrev, sumarMeses } from '../ui.js';
import { deudas, mesesPlan, importeHoja } from '../calc.js';
import { cabecera, vacio } from '../componentes.js';

export function render(main, ctx) {
  const I = ctx.I, ms = mesesPlan(I), ds = deudas(I);
  const hayTipo = [...I.tipos.values()].some(t => t.is_debt);
  const conFin = ds.filter(d => d.fin && d.cuotas > 0), sinFin = ds.filter(d => !d.fin);
  const pendiente = conFin.reduce((s, d) => s + d.total, 0);
  const prox = conFin[0];
  let frase;
  if (!ds.length) frase = 'Aquí verás cada deuda con su último pago y cuánto te deja libre al terminar.';
  else {
    frase = `Te quedan ${eur(pendiente)} por pagar en ${conFin.length} ${conFin.length === 1 ? 'deuda' : 'deudas'} con fecha de fin`;
    if (sinFin.length) frase += `, más ${sinFin.length} sin fecha de fin (${eur(sinFin.reduce((s, d) => s + d.m.amount, 0))} al mes)`;
    frase += '.';
    if (prox) frase += ` La próxima en terminar es «${prox.m.name}», en ${mesLargo(prox.fin)}.`;
  }
  main.append(cabecera('Deudas', frase));

  if (!ds.length) {
    main.append(vacio(hayTipo
      ? 'No tienes deudas apuntadas. Los gastos con un tipo que cuenta como deuda (por ejemplo «Deuda») aparecen aquí.'
      : 'Ningún tipo de gasto cuenta como deuda. Marca uno en Categorías para ver aquí tus préstamos y plazos.',
    h('a', { class: 'boton', href: '#/categorias', text: 'Ir a Categorías' })));
    return;
  }

  const lista = h('ol', { class: 'deudas', style: { '--n': ms.length } });
  lista.append(h('li', { class: 'deuda eje', 'aria-hidden': 'true' }, h('span'), h('div', { class: 'pista-meses' }, ms.map(k => h('span', { title: mesTitulo(k), text: mesAbrev(k).charAt(0) }))), h('span', { class: 'cuota-cab', text: 'Cuota' })));
  for (const d of ds) {
    const { m, fin } = d;
    const lineas = [];
    if (!fin) lineas.push(h('p', { class: 'meta', text: 'Sin fecha de fin' }));
    else if (d.cuotas === 0) lineas.push(h('p', { class: 'meta', text: 'Terminada en ' + mesLargo(fin) }));
    else {
      lineas.push(h('p', { class: 'meta', text: `Último pago en ${mesLargo(fin)}. Quedan ${d.cuotas} ${d.cuotas === 1 ? 'cuota' : 'cuotas'}, ${eur(d.total)} en total.` }));
      lineas.push(h('p', { class: 'meta libre', text: `Desde ${mesLargo(sumarMeses(fin, 1))} tienes ${eur(d.libera)} más al mes.` }));
    }
    const pagados = ms.filter(k => importeHoja(m, k) > 0).length;
    lista.append(h('li', { class: 'deuda' },
      h('div', { class: 'info' }, h('p', { class: 'nom', text: m.name }), lineas),
      h('div', { class: 'pista-meses barras', role: 'img', 'aria-label': `Se paga en ${pagados} de los ${ms.length} meses del plan` },
        ms.map(k => { const v = importeHoja(m, k); return h('i', { class: v > 0 ? (k === fin ? 'on ultimo' : 'on') : null, title: `${mesTitulo(k)}: ${v > 0 ? eur(v) : 'sin pago'}` }); })),
      h('button', { type: 'button', class: 'cuota', 'data-fk': 'deu-' + m.id, 'aria-label': `Editar ${m.name}`, onclick: () => ctx.abrirMovimiento({ id: m.id }), text: eur(importeHoja(m, ctx.mes) || m.amount) })));
  }
  main.append(h('section', { class: 'seccion' },
    h('div', { class: 'seccion-cab' }, h('h2', { text: 'Calendario de pagos' }), h('p', { text: 'Cada casilla es un mes del plan. La más oscura es el último pago.' })),
    lista));
}
