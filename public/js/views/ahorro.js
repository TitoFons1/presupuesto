import { h, eur, eurCorto, mesLargo, mesTitulo, mesAbrev, parseEur, centATexto, aviso, estadoQueda, rellenarMeses, rango, sumarMeses } from '../ui.js';
import { resumen, mesesPlan } from '../calc.js';
import { cabecera } from '../componentes.js';
import { columnas } from '../graficos.js';
import { api } from '../api.js';

export function render(main, ctx) {
  const I = ctx.I, ms = mesesPlan(I);
  let acum = 0;
  const filas = ms.map(k => { const r = resumen(I, k); acum += r.ah; return { k, r, acum }; });
  const total = acum;
  const porAnio = new Map();
  for (const f of filas) porAnio.set(f.k.slice(0, 4), (porAnio.get(f.k.slice(0, 4)) || 0) + f.r.ah);
  const anios = [...porAnio.entries()];
  const frase = total
    ? `Con este plan llegas a ${eurCorto(total)} ahorrados en ${mesLargo(ms.at(-1))}` + (anios.length > 1 ? ': ' + anios.map(([a, v]) => `${eurCorto(v)} en ${a}`).join(' y ') + '.' : '.')
    : 'Escribe cuánto quieres apartar cada mes y verás hasta dónde llegas.';
  main.append(cabecera('Ahorro', frase));

  main.append(h('section', { class: 'seccion' },
    h('div', { class: 'seccion-cab' }, h('h2', { text: 'Ahorro acumulado' }), h('p', { text: 'El mes elegido sale resaltado. Toca una barra para elegir otro.' })),
    columnas(filas.map(f => ({ k: f.k, etiqueta: mesAbrev(f.k), etiquetaLarga: mesTitulo(f.k), valor: f.acum, lineas: [`Ahorras ${eur(f.r.ah)}`, `Acumulado ${eur(f.acum)}`] })),
      { sel: ctx.mes, alElegir: k => ctx.setMes(k), descripcion: 'Ahorro acumulado por mes' })));

  const guardar = async (k, inp) => {
    const v = parseEur(inp.value);
    if (!Number.isFinite(v) || v < 0) { inp.setAttribute('aria-invalid', 'true'); aviso('Escribe una cantidad, por ejemplo 250.', 'mal'); return; }
    inp.removeAttribute('aria-invalid');
    if (v === (I.plan[k] || 0)) { inp.value = centATexto(v); return; }
    try { await api('PUT', `/plan/${k}`, { amount: v }); aviso(`Ahorro de ${mesLargo(k)} guardado`); await ctx.recargar(); }
    catch (e) { aviso(e.message, 'mal'); }
  };
  const tot = { ing: 0, gas: 0, disp: 0, ah: 0, queda: 0 };
  const cuerpo = filas.map(({ k, r, acum: a }) => {
    for (const x in tot) tot[x] += r[x];
    const inp = h('input', { class: 'entrada cifra corta', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-fk': 'ah-' + k, value: centATexto(r.ah), 'aria-label': 'Ahorro de ' + mesLargo(k) });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('change', () => guardar(k, inp));
    const est = estadoQueda(r.queda);
    return h('tr', { class: k === ctx.mes ? 'sel' : null },
      h('td', { class: 'col-mes' }, h('a', { href: '#/mes/' + k, class: 'enlace', text: mesTitulo(k) }),
        h('span', { class: 'sub det', text: `Entra ${eur(r.ing)}, sale ${eur(r.gas)}. Acumulado ${eur(a)}.` })),
      h('td', { class: 'n col-ing', text: eur(r.ing) }), h('td', { class: 'n col-gas', text: eur(r.gas) }), h('td', { class: 'n col-disp', text: eur(r.disp) }),
      h('td', { class: 'n col-ah' }, h('span', { class: 'etq-movil', 'aria-hidden': 'true', text: 'Ahorras' }), inp),
      h('td', { class: 'n col-queda' }, h('span', { class: 'etq-movil', 'aria-hidden': 'true', text: 'Te queda' }), h('span', { class: 'q ' + est.clase, text: eur(r.queda) }), r.queda < 2500 ? h('span', { class: 'sr', text: est.texto }) : null),
      h('td', { class: 'n col-acum', text: eur(a) }));
  });
  main.append(h('section', { class: 'seccion' },
    h('div', { class: 'seccion-cab' }, h('h2', { text: 'Mes a mes' }), h('p', { text: '«Te queda» es lo que sobra después de pagarlo todo y apartar el ahorro.' })),
    h('div', { class: 'tabla-env tabla-ahorro' }, h('table', null,
      h('thead', null, h('tr', null, [['Mes', 'col-mes'], ['Entra', 'col-ing'], ['Sale', 'col-gas'], ['Disponible', 'col-disp'], ['Ahorras', 'col-ah'], ['Te queda', 'col-queda'], ['Acumulado', 'col-acum']]
        .map(([t, c], i) => h('th', { scope: 'col', class: (i ? 'n ' : '') + c, text: t })))),
      h('tbody', null, cuerpo),
      h('tfoot', null, h('tr', null, h('td', { class: 'col-mes', text: 'Total' }), h('td', { class: 'n col-ing', text: eur(tot.ing) }), h('td', { class: 'n col-gas', text: eur(tot.gas) }), h('td', { class: 'n col-disp', text: eur(tot.disp) }),
        h('td', { class: 'n col-ah' }, h('span', { class: 'etq-movil', 'aria-hidden': 'true', text: 'Ahorras' }), eur(tot.ah)),
        h('td', { class: 'n col-queda' }, h('span', { class: 'etq-movil', 'aria-hidden': 'true', text: 'Te queda' }), eur(tot.queda)),
        h('td', { class: 'n col-acum', text: eur(total) })))))));

  // Duración del plan
  const opciones = rango(sumarMeses(ms[0], -24), sumarMeses(ms.at(-1), 36));
  const ini = h('select', { class: 'entrada', id: 'plan-ini' }), fin = h('select', { class: 'entrada', id: 'plan-fin' });
  rellenarMeses(ini, opciones, ms[0]); rellenarMeses(fin, opciones, ms.at(-1));
  const cambiar = async () => {
    try { await api('PUT', '/settings', { plan_start: ini.value, plan_end: fin.value }); aviso('Duración del plan guardada'); await ctx.recargar(); }
    catch (e) { aviso(e.message, 'mal'); rellenarMeses(ini, opciones, ms[0]); rellenarMeses(fin, opciones, ms.at(-1)); }
  };
  ini.addEventListener('change', cambiar); fin.addEventListener('change', cambiar);
  main.append(h('section', { class: 'seccion' },
    h('h2', { text: 'Duración del plan' }),
    h('div', { class: 'fila-campos estrecha' },
      h('div', { class: 'campo' }, h('label', { for: 'plan-ini', text: 'Primer mes' }), ini),
      h('div', { class: 'campo' }, h('label', { for: 'plan-fin', text: 'Último mes' }), fin)),
    h('p', { class: 'ayuda', text: 'Todas las vistas usan estos meses. Como mucho, 5 años.' })));
}
