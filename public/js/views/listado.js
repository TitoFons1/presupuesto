// Vista de gestión de gastos o de ingresos, con subgastos en árbol y filtros.
// En el móvil cada fila se convierte en una línea compacta que se toca para editar.
import { h, eur, mesCorto, mesHoy, icono } from '../ui.js';
import { importe, hijosDe, esCompuesto, catDe, catRaiz, tipoDe, hojas, ultimoPago } from '../calc.js';
import { cabecera, muestra, cuando, vacio } from '../componentes.js';

const filtros = { gasto: { texto: '', cat: '', tipo: '', terminados: false }, ingreso: { texto: '', cat: '', tipo: '', terminados: false } };
const abiertos = new Set();
let filtrosVisibles = false;

// Permite que otras vistas abran la lista ya filtrada (por ejemplo, desde el resumen).
export function fijarFiltro(kind, cambios) {
  Object.assign(filtros[kind], { texto: '', cat: '', tipo: '' }, cambios);
  if (cambios.cat || cambios.tipo) filtrosVisibles = true;
}

function terminado(I, m) {
  const hoy = mesHoy();
  return hojas(I, m).every(x => { const f = ultimoPago(x); return f && f < hoy; });
}

export function crearVista(kind) {
  const esGasto = kind === 'gasto';
  const palabra = esGasto ? 'gasto' : 'ingreso';
  return {
    render(main, ctx) {
      const I = ctx.I, k = ctx.mes, f = filtros[kind];
      const todos = I.raices.filter(m => m.kind === kind);

      const coincide = m => {
        const t = f.texto.toLowerCase();
        if (t && !m.name.toLowerCase().includes(t) && !(m.notes || '').toLowerCase().includes(t)) return false;
        if (f.cat) {
          const c = catDe(I, m);
          if (!c || (String(c.id) !== f.cat && String(catRaiz(I, c).id) !== f.cat)) return false;
        }
        if (f.tipo) { const tp = tipoDe(I, m); if (!tp || String(tp.id) !== f.tipo) return false; }
        return true;
      };
      const filtrando = !!(f.texto || f.cat || f.tipo);
      const visible = m => coincide(m) || hijosDe(I, m).some(visible);
      const raices = todos.filter(m => (f.terminados || !terminado(I, m)) && visible(m))
        .sort((a, b) => {
          const ca = catRaiz(I, catDe(I, a)), cb = catRaiz(I, catDe(I, b));
          return (ca ? ca.sort : 999) - (cb ? cb.sort : 999) || a.name.localeCompare(b.name, 'es');
        });
      const nTerminados = todos.filter(m => terminado(I, m)).length;

      main.append(cabecera(esGasto ? 'Gastos' : 'Ingresos',
        esGasto
          ? 'Todo lo que pagas, fijo o puntual. Agrupa gastos con subgastos: «Suministros» con luz, gas y agua.'
          : 'Tu nómina, las pagas extra y cualquier otro dinero que te entre.',
        h('button', { type: 'button', class: 'boton principal solo-escritorio', text: `Añadir ${palabra}`, onclick: () => ctx.abrirMovimiento({ kind }) })));

      /* --- filtros --- */
      const buscar = h('input', { class: 'entrada', id: `buscar-${kind}`, type: 'search', value: f.texto, placeholder: 'Buscar por nombre o nota', autocomplete: 'off', 'aria-label': 'Buscar', 'data-fk': `buscar-${kind}` });
      let t = null;
      buscar.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.texto = buscar.value.trim(); ctx.repintar(); }, 250); });
      const selCat = h('select', { class: 'entrada', id: `fcat-${kind}`, 'data-fk': `fcat-${kind}` }, h('option', { value: '', text: 'Todas' }),
        I.catsRaiz(kind).map(c => h('optgroup', { label: c.name }, h('option', { value: String(c.id), text: c.name + ' (todas)' }),
          (I.subcats.get(c.id) || []).map(s => h('option', { value: String(s.id), text: s.name })))));
      selCat.value = f.cat;
      selCat.addEventListener('change', () => { f.cat = selCat.value; ctx.repintar(); });
      const selTipo = esGasto ? h('select', { class: 'entrada', id: `ftipo-${kind}`, 'data-fk': `ftipo-${kind}` }, h('option', { value: '', text: 'Todos' }),
        [...I.tipos.values()].sort((a, b) => a.sort - b.sort).map(x => h('option', { value: String(x.id), text: x.name }))) : null;
      if (selTipo) { selTipo.value = f.tipo; selTipo.addEventListener('change', () => { f.tipo = selTipo.value; ctx.repintar(); }); }
      const casTerm = h('input', { type: 'checkbox', id: `fterm-${kind}`, checked: f.terminados });
      casTerm.addEventListener('change', () => { f.terminados = casTerm.checked; ctx.repintar(); });
      const nActivos = (f.cat ? 1 : 0) + (f.tipo ? 1 : 0) + (f.terminados ? 1 : 0);
      const botonFiltros = h('button', { type: 'button', class: 'boton boton-filtros', 'aria-expanded': String(filtrosVisibles), 'aria-controls': `extra-${kind}`, 'data-fk': `bf-${kind}`,
        onclick: () => { filtrosVisibles = !filtrosVisibles; ctx.repintar(); } }, icono('filtro'), nActivos ? `Filtros (${nActivos})` : 'Filtros');
      main.append(h('div', { class: 'filtros', role: 'search' },
        h('div', { class: 'campo buscar' }, h('label', { for: buscar.id, class: 'solo-escritorio', text: 'Buscar' }), buscar),
        botonFiltros,
        h('div', { class: 'filtros-extra' + (filtrosVisibles ? '' : ' cerrado'), id: `extra-${kind}` },
          h('div', { class: 'campo' }, h('label', { for: selCat.id, text: 'Categoría' }), selCat),
          selTipo ? h('div', { class: 'campo' }, h('label', { for: selTipo.id, text: 'Tipo de gasto' }), selTipo) : null,
          nTerminados ? h('label', { class: 'casilla' }, casTerm, `Ver los que ya terminaron (${nTerminados})`) : null,
          filtrando || f.terminados ? h('button', { type: 'button', class: 'enlace', text: 'Quitar filtros', onclick: () => { Object.assign(f, { texto: '', cat: '', tipo: '', terminados: false }); ctx.repintar(); } }) : null)));

      if (!todos.length) {
        main.append(vacio(esGasto ? 'Aún no tienes gastos. Empieza por los fijos: alquiler, luz, teléfono…' : 'Aún no tienes ingresos. Empieza por tu nómina.',
          h('button', { type: 'button', class: 'boton principal', text: `Añadir ${palabra}`, onclick: () => ctx.abrirMovimiento({ kind }) })));
        return;
      }
      if (!raices.length) { main.append(vacio('Nada coincide con estos filtros. Prueba a quitar alguno.')); return; }

      /* --- tabla en árbol --- */
      const filas = [];
      const pintar = (m, nivel) => {
        const hs = hijosDe(I, m).filter(x => visible(x) && (f.terminados || !terminado(I, x)));
        const abierto = abiertos.has(m.id) || (filtrando && hs.length > 0);
        const c = catDe(I, m), cr = catRaiz(I, c), tp = tipoDe(I, m);
        const compuesto = esCompuesto(I, m);
        const nEsp = Object.keys(m.overrides || {}).length;
        const textoCat = c ? (c !== cr ? `${cr.name}, ${c.name}` : c.name) : 'Sin categoría';
        filas.push(h('tr', { class: (nivel ? 'hijo' : '') + (compuesto ? ' compuesto' : '') },
          h('td', { class: 'concepto' },
            h('div', { class: 'arbol', style: { '--nivel': nivel } },
              hs.length
                ? h('button', { type: 'button', class: 'plegar', 'aria-expanded': String(abierto), 'data-fk': `pl-${kind}-${m.id}`, 'aria-label': (abierto ? 'Ocultar' : 'Mostrar') + ` los sub${palabra}s de ${m.name}`,
                  onclick: () => { if (abiertos.has(m.id)) abiertos.delete(m.id); else abiertos.add(m.id); ctx.repintar(); }, text: abierto ? '−' : '+' })
                : h('span', { class: 'plegar-hueco' }),
              h('div', { class: 'concepto-txt' },
                h('button', { type: 'button', class: 'nom', 'data-fk': `ed-${m.id}`, 'aria-label': `Editar ${m.name}`, onclick: () => ctx.abrirMovimiento({ id: m.id }), text: m.name }),
                m.notes ? h('span', { class: 'sub nota', text: m.notes }) : null,
                // Resumen en una línea, visible solo en el móvil
                h('span', { class: 'sub resumen-movil' }, muestra(cr ? cr.color : 'c0'), [textoCat, tp && esGasto ? tp.name : null, cuando(I, m)].filter(Boolean).join(', '))))),
          h('td', { class: 'col-cat' }, c ? h('span', { class: 'cat' }, muestra(cr.color), h('span', null, c.name, c !== cr ? h('span', { class: 'sub', text: cr.name }) : null)) : h('span', { class: 'sub', text: 'Sin categoría' })),
          esGasto ? h('td', { class: 'col-tipo', text: tp ? tp.name : '' }) : null,
          h('td', { class: 'n col-imp' }, compuesto
            ? [eur(importe(I, m, k)), h('span', { class: 'sub', text: `en ${mesCorto(k)}, suma de ${hijosDe(I, m).length}` })]
            : [eur(m.amount), nEsp ? h('span', { class: 'sub', text: nEsp === 1 ? '1 mes distinto' : `${nEsp} meses distintos` }) : null]),
          h('td', { class: 'cuando col-cuando', text: cuando(I, m) }),
          h('td', { class: 'acc col-acc' },
            nivel < 4 ? h('button', { type: 'button', class: 'enlace', text: `Añadir sub${palabra}`, 'aria-label': `Añadir sub${palabra} a ${m.name}`, onclick: () => ctx.abrirMovimiento({ parentId: m.id }) }) : null)));
        if (abierto) hs.forEach(x => pintar(x, nivel + 1));
      };
      raices.forEach(m => pintar(m, 0));
      const totalMes = raices.reduce((s, m) => s + importe(I, m, k), 0);
      main.append(h('div', { class: 'tabla-env lista-movil' }, h('table', { class: 'tabla-arbol' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Concepto' }), h('th', { scope: 'col', class: 'col-cat', text: 'Categoría' }), esGasto ? h('th', { scope: 'col', class: 'col-tipo', text: 'Tipo' }) : null,
          h('th', { scope: 'col', class: 'n col-imp', text: 'Importe' }), h('th', { scope: 'col', class: 'col-cuando', text: 'Cuándo' }), h('th', { scope: 'col', class: 'col-acc' }, h('span', { class: 'sr', text: 'Acciones' })))),
        h('tbody', null, filas),
        h('tfoot', null, h('tr', null, h('td', { colspan: esGasto ? '3' : '2', class: 'total-txt', text: `En ${mesCorto(k)} suman` }), h('td', { class: 'n col-imp', text: eur(totalMes) }), h('td', { colspan: '2', class: 'col-cuando' }))))));
      main.append(h('p', { class: 'ayuda', text: `Toca un ${palabra} para editarlo. Desde ahí también puedes añadirle sub${palabra}s o borrarlo.` }));
    },
  };
}
