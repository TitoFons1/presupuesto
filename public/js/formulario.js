// Diálogo para crear y editar gastos e ingresos (también subgastos).
import { h, dialogo, aviso, eur, centATexto, parseEur, rellenarMeses, rango, sumarMeses, mesLargo, mesTitulo } from './ui.js';
import { api } from './api.js';
import { esCompuesto, esUnaVez, importeHoja, importe, hijosDe, descendientes, arbolPlano, mesesPlan } from './calc.js';

const FRECUENCIAS = [['una', 'Una sola vez'], ['1', 'Cada mes'], ['2', 'Cada 2 meses'], ['3', 'Cada 3 meses'], ['4', 'Cada 4 meses'], ['6', 'Cada 6 meses'], ['12', 'Cada año']];
const clonar = o => JSON.parse(JSON.stringify(o));
const sinCampos = m => { const c = clonar(m); delete c.id; delete c.updated_at; return c; };
let uid = 0;

function selectCategoria(I, kind, valor, id) {
  const sel = h('select', { class: 'entrada', id });
  sel.append(h('option', { value: '', text: 'Sin categoría' }));
  for (const c of I.catsRaiz(kind)) {
    const g = h('optgroup', { label: c.name });
    g.append(h('option', { value: String(c.id), text: c.name + ' (general)' }));
    for (const s of I.subcats.get(c.id) || []) g.append(h('option', { value: String(s.id), text: s.name }));
    sel.append(g);
  }
  sel.value = valor != null ? String(valor) : '';
  return sel;
}

function campo(etiqueta, control, ayuda) {
  return h('div', { class: 'campo' }, h('label', { for: control.id, text: etiqueta }), control, ayuda ? h('small', { text: ayuda }) : null);
}

// Copia de un movimiento y de todos sus subgastos, padres primero (para «Deshacer»).
function subarbol(I, m) {
  const out = [sinCampos(m)];
  out[0].id = m.id;
  for (const x of hijosDe(I, m)) out.push(...subarbol(I, x));
  return out;
}
async function restaurar(ctx, copia) {
  const nuevos = new Map();
  for (const x of copia) {
    const cuerpo = { ...x };
    delete cuerpo.id;
    if (cuerpo.parent_id != null && nuevos.has(cuerpo.parent_id)) cuerpo.parent_id = nuevos.get(cuerpo.parent_id);
    const r = await api('POST', '/movements', cuerpo);
    nuevos.set(x.id, r.id);
  }
}

/**
 * o: { id, kind, parentId, mes, borrador }
 *  - id: editar ese movimiento
 *  - parentId: crear un subgasto dentro de ese movimiento
 *  - mes: mes desde el que se abre (permite cambiar solo ese mes)
 *  - borrador: valores ya escritos al cambiar entre gasto e ingreso
 */
export function abrirMovimiento(ctx, o = {}) {
  const I = ctx.I;
  const m = o.id != null ? I.movs.get(o.id) : null;
  if (o.id != null && !m) { aviso('Ese movimiento ya no existe.', 'mal'); return; }
  const padreInicial = !m && o.parentId != null ? I.movs.get(o.parentId) : null;
  const kind = m ? m.kind : padreInicial ? padreInicial.kind : (o.kind === 'ingreso' ? 'ingreso' : 'gasto');
  const esGasto = kind === 'gasto';
  const b = o.borrador || {};
  const w = m ? clonar(m) : {
    kind, name: b.name || '', amount: 0,
    category_id: null, type_id: null,
    parent_id: padreInicial ? padreInicial.id : null,
    start_month: b.start_month || o.mes || ctx.mes, end_month: null, every: b.every || 1, notes: '', overrides: {},
  };
  if (!m && b.una) w.end_month = w.start_month;
  if (!w.overrides || typeof w.overrides !== 'object') w.overrides = {};
  const compuesto = m ? esCompuesto(I, m) : false;
  const nHijos = m ? hijosDe(I, m).length : 0;
  const mesCtx = m && o.mes && !compuesto && !esUnaVez(m) && importeHoja(m, o.mes) > 0 ? o.mes : null;
  const p = 'f' + (++uid) + '-';
  const palabra = esGasto ? 'gasto' : 'ingreso';

  /* --- gasto o ingreso (solo al crear) --- */
  let selector = null;
  if (!m && !padreInicial) {
    const cambiar = nuevo => {
      if (nuevo === kind) return;
      const una = frec.value === 'una';
      d.cerrar();
      abrirMovimiento(ctx, { ...o, kind: nuevo, borrador: { name: nombre.value, importe: importeIn.value, start_month: desde.value, una, every: una ? 1 : +frec.value } });
    };
    selector = h('div', { class: 'segmentos', role: 'radiogroup', 'aria-label': 'Qué quieres añadir' },
      ['gasto', 'ingreso'].map(k => h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === kind), class: k === kind ? 'activo' : null, text: k === 'gasto' ? 'Gasto' : 'Ingreso', onclick: () => cambiar(k) })));
  }

  /* --- controles --- */
  const nombre = h('input', { class: 'entrada', id: p + 'nombre', type: 'text', maxlength: '120', autocomplete: 'off', value: w.name, placeholder: esGasto ? 'Por ejemplo, Luz' : 'Por ejemplo, Nómina' });
  const importeIn = h('input', { class: 'entrada cifra', id: p + 'importe', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00',
    value: m ? centATexto(mesCtx ? importeHoja(m, mesCtx) : w.amount) : (b.importe || '') });
  const cat = selectCategoria(I, kind, w.category_id, p + 'cat');
  const tipo = h('select', { class: 'entrada', id: p + 'tipo' }, h('option', { value: '', text: 'Sin tipo' }),
    [...I.tipos.values()].sort((a, c) => a.sort - c.sort).map(t => h('option', { value: String(t.id), text: t.name + (t.is_debt ? ' (cuenta como deuda)' : '') })));
  tipo.value = w.type_id != null ? String(w.type_id) : '';

  const excluir = m ? new Set([m.id, ...descendientes(I, m.id)]) : new Set();
  const padreSel = h('select', { class: 'entrada', id: p + 'padre' }, h('option', { value: '', text: esGasto ? 'No, es un gasto principal' : 'No, es un ingreso principal' }),
    arbolPlano(I, kind, excluir).filter(x => x.nivel < 4).map(x => h('option', { value: String(x.m.id), text: '   '.repeat(x.nivel) + x.m.name })));
  padreSel.value = w.parent_id != null ? String(w.parent_id) : '';
  const avisoPadre = h('p', { class: 'ayuda', hidden: true });

  const frec = h('select', { class: 'entrada', id: p + 'frec' }, FRECUENCIAS.map(([v, t]) => h('option', { value: v, text: t })));
  frec.value = esUnaVez(w) ? 'una' : String(w.every || 1);
  const ms = mesesPlan(I);
  const meses = rango(sumarMeses(ms[0], -24), sumarMeses(ms.at(-1), 48));
  const desde = h('select', { class: 'entrada', id: p + 'desde' });
  rellenarMeses(desde, meses, w.start_month);
  const hasta = h('select', { class: 'entrada', id: p + 'hasta' });
  rellenarMeses(hasta, meses, esUnaVez(w) ? null : w.end_month, ['', 'Sin fecha de fin']);
  if (esUnaVez(w)) hasta.value = '';
  const etDesde = h('label', { for: desde.id, text: 'Primer mes' });
  const campoHasta = h('div', { class: 'campo' }, h('label', { for: hasta.id, text: 'Último mes' }), hasta);
  const notas = h('textarea', { class: 'entrada', id: p + 'notas', maxlength: '1000', rows: '2', value: w.notes || '' });

  /* --- importes especiales --- */
  const listaEsp = h('ul', { class: 'especiales' });
  const espMes = h('select', { class: 'entrada', id: p + 'espmes', 'aria-label': 'Mes del importe especial' });
  const espImp = h('input', { class: 'entrada cifra', id: p + 'espimp', type: 'text', inputmode: 'decimal', placeholder: '0,00', 'aria-label': 'Importe especial' });
  const espError = h('p', { class: 'error', hidden: true });
  function pintarEspeciales() {
    const ks = Object.keys(w.overrides).sort();
    listaEsp.replaceChildren(...(ks.length ? ks.map(k => h('li', null,
      h('span', { text: `${mesTitulo(k)}: ${w.overrides[k] > 0 ? eur(w.overrides[k]) : 'no se paga'}` }),
      h('button', { type: 'button', class: 'enlace', text: 'Quitar', 'aria-label': 'Quitar el importe especial de ' + mesLargo(k), onclick: () => { delete w.overrides[k]; pintarEspeciales(); } })))
      : [h('li', { class: 'ayuda', text: 'Ningún mes tiene un importe distinto.' })]));
    const ini = desde.value || w.start_month;
    const fin = hasta.value || sumarMeses(ini, 36);
    rellenarMeses(espMes, rango(ini, fin), espMes.value && espMes.value >= ini && espMes.value <= fin ? espMes.value : (o.mes && o.mes >= ini && o.mes <= fin ? o.mes : ini));
  }
  const bloqueEspeciales = h('div', { class: 'bloque-especiales' },
    h('p', { class: 'etq-campo', text: 'Importes distintos en algunos meses' }),
    h('p', { class: 'ayuda', text: 'Cuando un mes se paga otra cantidad, o nada (pon 0).' }),
    listaEsp,
    h('div', { class: 'fila-esp' }, espMes, espImp, h('button', { type: 'button', class: 'boton peque', text: 'Añadir', onclick: () => {
      const v = parseEur(espImp.value);
      if (!Number.isFinite(v) || v < 0) { espError.textContent = 'Escribe un importe, por ejemplo 240 o 0.'; espError.hidden = false; return; }
      espError.hidden = true; w.overrides[espMes.value] = v; espImp.value = ''; pintarEspeciales();
    } })),
    espError);

  /* --- alcance del cambio cuando se abre desde un mes --- */
  const tieneEsp = !!(mesCtx && Object.prototype.hasOwnProperty.call(w.overrides, mesCtx));
  const alcTodos = h('input', { type: 'radio', name: p + 'alc', value: 'todos', checked: !tieneEsp });
  const alcMes = h('input', { type: 'radio', name: p + 'alc', value: 'mes', checked: tieneEsp });
  const alcance = mesCtx ? h('fieldset', null, h('legend', { text: 'Este importe vale para' }),
    h('div', { class: 'opciones' }, h('label', { class: 'opcion' }, alcTodos, 'Todos los meses'), h('label', { class: 'opcion' }, alcMes, 'Solo ' + mesLargo(mesCtx)))) : null;

  const error = h('p', { class: 'error', role: 'alert', hidden: true });

  /* --- bloques --- */
  const bloqueImporte = compuesto
    ? h('div', { class: 'nota-compuesto' },
      h('p', null, `Suma de sus ${nHijos} sub${palabra}s: `, h('strong', { text: eur(importe(I, m, ctx.mes)) }), ` en ${mesLargo(ctx.mes)}.`),
      h('p', { class: 'ayuda', text: `Las fechas e importes salen de cada sub${palabra}. Cámbialos desde la lista.` }))
    : campo('Importe (€)', importeIn, mesCtx ? `Importe de ${mesLargo(mesCtx)}.` : null);
  const bloqueFechas = compuesto ? null : h('div', { class: 'grupo-campos' },
    h('div', { class: 'fila-campos' }, campo('¿Cada cuánto?', frec), h('div', { class: 'campo' }, etDesde, desde), campoHasta),
    alcance);

  // Lo menos habitual va plegado; se abre solo si ya tiene algo.
  const masOpciones = h('details', { class: 'plegable mas-opciones' },
    h('summary', { text: 'Más opciones' }),
    h('div', { class: 'grupo-campos sin-regla' },
      h('div', { class: 'campo' }, h('label', { for: padreSel.id, text: esGasto ? '¿Forma parte de otro gasto?' : '¿Forma parte de otro ingreso?' }), padreSel,
        h('small', { text: esGasto ? 'Por ejemplo, «Luz» dentro de «Suministros». El principal suma todos sus subgastos.' : 'El ingreso principal suma todos sus subingresos.' }), avisoPadre),
      compuesto ? null : bloqueEspeciales,
      campo('Notas', notas)));
  if (m && ((w.parent_id != null) || Object.keys(w.overrides).length || (w.notes || '').trim())) masOpciones.open = true;

  function sincronizar() {
    const una = frec.value === 'una';
    campoHasta.hidden = una;
    etDesde.textContent = una ? 'Mes' : 'Primer mes';
    bloqueEspeciales.hidden = una;
    if (alcance) alcance.hidden = una;
    const padre = padreSel.value ? I.movs.get(+padreSel.value) : null;
    if (padre && !esCompuesto(I, padre) && padre.amount > 0) {
      avisoPadre.textContent = `«${padre.name}» pasará a valer la suma de sus sub${palabra}s. Ahora vale ${eur(padre.amount)} por su cuenta.`;
      avisoPadre.hidden = false;
    } else avisoPadre.hidden = true;
    if (!compuesto) pintarEspeciales();
  }
  [frec, desde, hasta, padreSel].forEach(c => c.addEventListener('change', sincronizar));
  padreSel.addEventListener('change', () => {
    const padre = padreSel.value ? I.movs.get(+padreSel.value) : null;
    if (padre && !cat.value && padre.category_id != null) cat.value = String(padre.category_id);
    if (padre && esGasto && !tipo.value && padre.type_id != null) tipo.value = String(padre.type_id);
  });
  if (padreInicial) {
    if (padreInicial.category_id != null) cat.value = String(padreInicial.category_id);
    if (esGasto && padreInicial.type_id != null) tipo.value = String(padreInicial.type_id);
  }

  /* --- botones --- */
  const guardar = h('button', { type: 'submit', class: 'boton principal', text: m ? 'Guardar cambios' : (padreInicial ? `Añadir sub${palabra}` : `Añadir ${palabra}`) });
  const cancelar = h('button', { type: 'button', class: 'boton', text: 'Cancelar' });
  const borrar = m ? h('button', { type: 'button', class: 'boton sutil peligro-texto', text: 'Eliminar' }) : null;
  const quitarMes = mesCtx ? h('button', { type: 'button', class: 'boton sutil', text: 'Quitar solo de ' + mesLargo(mesCtx) }) : null;
  const nivelOk = () => { let n = 0, x = m; while (x && x.parent_id != null) { n++; x = I.movs.get(x.parent_id); } return n < 4; };
  const subgasto = m && nivelOk() ? h('button', { type: 'button', class: 'boton sutil', text: `Añadir sub${palabra}` }) : null;
  const confirmacion = h('div', { class: 'confirmacion', hidden: true });
  const secundarios = (borrar || quitarMes || subgasto) ? h('div', { class: 'acciones-sec' }, subgasto, quitarMes, borrar) : null;
  const pie = h('div', { class: 'pie fijo' }, h('div', null, cancelar, guardar));

  const form = h('form', { class: 'formulario', novalidate: true },
    selector,
    campo('Concepto', nombre),
    bloqueImporte,
    h('div', { class: 'fila-campos' }, campo('Categoría', cat), esGasto ? campo('Tipo de gasto', tipo, 'Los de tipo deuda salen en Deudas.') : null),
    bloqueFechas,
    masOpciones,
    secundarios,
    error, confirmacion, pie);

  const titulo = m ? `Editar ${palabra}` : padreInicial ? `Nuevo sub${palabra} de «${padreInicial.name}»` : 'Añadir';
  const d = dialogo({ titulo, cuerpo: form, enfocar: !m, clase: 'dialogo-mov' });
  sincronizar();

  const fallo = t => { error.textContent = t; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); };
  cancelar.addEventListener('click', () => d.cerrar());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    error.hidden = true;
    const name = nombre.value.trim();
    if (!name) { nombre.setAttribute('aria-invalid', 'true'); nombre.focus(); return fallo('Escribe un concepto.'); }
    nombre.removeAttribute('aria-invalid');
    const cuerpo = {
      kind, name, amount: w.amount,
      category_id: cat.value ? +cat.value : null,
      type_id: esGasto && tipo.value ? +tipo.value : null,
      parent_id: padreSel.value ? +padreSel.value : null,
      start_month: w.start_month, end_month: w.end_month, every: w.every, notes: notas.value.trim(), overrides: { ...w.overrides },
    };
    if (!compuesto) {
      const imp = parseEur(importeIn.value);
      if (!Number.isFinite(imp) || imp < 0) { importeIn.setAttribute('aria-invalid', 'true'); importeIn.focus(); return fallo('Escribe un importe válido, por ejemplo 27,28.'); }
      importeIn.removeAttribute('aria-invalid');
      const una = frec.value === 'una';
      cuerpo.start_month = desde.value;
      cuerpo.end_month = una ? desde.value : (hasta.value || null);
      cuerpo.every = una ? 1 : +frec.value;
      if (cuerpo.end_month && cuerpo.end_month < cuerpo.start_month) return fallo('El último mes no puede ser anterior al primero.');
      if (una) { cuerpo.amount = imp; cuerpo.overrides = {}; }
      else if (mesCtx && alcMes.checked && !alcance.hidden) {
        if (imp === w.amount) delete cuerpo.overrides[mesCtx]; else cuerpo.overrides[mesCtx] = imp;
      } else {
        cuerpo.amount = imp;
        if (mesCtx) delete cuerpo.overrides[mesCtx];
      }
      for (const k of Object.keys(cuerpo.overrides)) {
        if (k < cuerpo.start_month || (cuerpo.end_month && k > cuerpo.end_month)) delete cuerpo.overrides[k];
      }
    }
    guardar.disabled = true;
    try {
      if (m) await api('PUT', `/movements/${m.id}`, cuerpo);
      else await api('POST', '/movements', cuerpo);
      d.cerrar();
      aviso(m ? 'Cambios guardados' : (padreInicial ? `Sub${palabra} añadido` : `${palabra[0].toUpperCase() + palabra.slice(1)} añadido`));
      await ctx.recargar();
    } catch (err) {
      fallo(err.message);
      guardar.disabled = false;
    }
  });

  if (borrar) borrar.addEventListener('click', () => {
    pie.hidden = true; secundarios.hidden = true;
    confirmacion.replaceChildren(
      h('p', { text: nHijos ? `¿Eliminar «${m.name}» y sus ${nHijos} sub${palabra}s de todos los meses?` : `¿Eliminar «${m.name}» de todos los meses?` }),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'boton peligro', text: 'Sí, eliminar', onclick: async ev => {
          ev.target.disabled = true;
          const copia = subarbol(I, m);
          try {
            await api('DELETE', `/movements/${m.id}`);
            d.cerrar();
            await ctx.recargar();
            aviso(`«${m.name}» eliminado`, '', { texto: 'Deshacer', fn: async () => {
              try { await restaurar(ctx, copia); aviso(`«${m.name}» recuperado`); } catch (err2) { aviso(err2.message, 'mal'); }
              await ctx.recargar();
            } });
          } catch (err) { fallo(err.message); ev.target.disabled = false; }
        } }),
        h('button', { type: 'button', class: 'boton', text: 'No, mantener', onclick: () => { confirmacion.hidden = true; pie.hidden = false; secundarios.hidden = false; borrar.focus(); } })));
    confirmacion.hidden = false;
    confirmacion.querySelector('button').focus();
  });

  if (quitarMes) quitarMes.addEventListener('click', async () => {
    const cuerpo = { ...sinCampos(m), overrides: { ...m.overrides, [mesCtx]: 0 } };
    try {
      await api('PUT', `/movements/${m.id}`, cuerpo);
      d.cerrar(); await ctx.recargar();
      aviso('Quitado de ' + mesLargo(mesCtx), '', { texto: 'Deshacer', fn: async () => {
        try { await api('PUT', `/movements/${m.id}`, sinCampos(m)); aviso('Vuelve a estar en ' + mesLargo(mesCtx)); } catch (err2) { aviso(err2.message, 'mal'); }
        await ctx.recargar();
      } });
    } catch (err) { fallo(err.message); }
  });

  if (subgasto) subgasto.addEventListener('click', () => { d.cerrar(); abrirMovimiento(ctx, { parentId: m.id, mes: o.mes || ctx.mes }); });
}
