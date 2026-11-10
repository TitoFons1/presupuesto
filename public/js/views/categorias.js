import { h, aviso, confirmar } from '../ui.js';
import { api } from '../api.js';
import { cabecera, muestra } from '../componentes.js';

const COLORES = [['c1', 'Azul'], ['c2', 'Naranja'], ['c3', 'Turquesa'], ['c4', 'Amarillo'], ['c5', 'Rosa'], ['c6', 'Verde'], ['c7', 'Violeta'], ['c8', 'Rojo']];
let editando = null; // 'cat-12', 'tipo-3' o 'color-12'

function usos(I, cat) {
  const ids = new Set([cat.id, ...(I.subcats.get(cat.id) || []).map(s => s.id)]);
  return I.datos.movements.filter(m => ids.has(m.category_id)).length;
}
const textoUsos = n => (n === 0 ? 'Sin usar' : n === 1 ? '1 movimiento' : `${n} movimientos`);

async function llamar(ctx, metodo, ruta, cuerpo, ok) {
  try { await api(metodo, ruta, cuerpo); editando = null; if (ok) aviso(ok); await ctx.recargar(); return true; }
  catch (e) { aviso(e.message, 'mal'); return false; }
}

function renombrar(ctx, clave, actual, alGuardar, etiqueta) {
  if (editando !== clave) return null;
  const inp = h('input', { class: 'entrada', type: 'text', value: actual, maxlength: '60', 'aria-label': etiqueta, 'data-fk': 'ren-' + clave });
  const form = h('form', { class: 'en-linea', onsubmit: e => { e.preventDefault(); const v = inp.value.trim(); if (!v) { aviso('El nombre no puede quedar vacío.', 'mal'); return; } alGuardar(v); } },
    inp, h('button', { type: 'submit', class: 'boton peque principal', text: 'Guardar' }),
    h('button', { type: 'button', class: 'boton peque', text: 'Cancelar', onclick: () => { editando = null; ctx.repintar(); } }));
  requestAnimationFrame(() => { inp.focus(); inp.select(); });
  return form;
}

function bloqueCategoria(ctx, c) {
  const I = ctx.I, subs = I.subcats.get(c.id) || [];
  const n = usos(I, c);
  const formNombre = renombrar(ctx, 'cat-' + c.id, c.name, v => llamar(ctx, 'PUT', `/categories/${c.id}`, { name: v }, 'Nombre cambiado'), 'Nombre de la categoría');
  const elegirColor = editando === 'color-' + c.id
    ? h('div', { class: 'colores', role: 'group', 'aria-label': 'Color de ' + c.name },
      COLORES.map(([k, nombre]) => h('button', { type: 'button', class: 'color-op ' + k, 'aria-pressed': String(k === c.color), 'aria-label': nombre, title: nombre,
        onclick: () => llamar(ctx, 'PUT', `/categories/${c.id}`, { color: k }, 'Color cambiado') })),
      h('button', { type: 'button', class: 'boton peque', text: 'Cancelar', onclick: () => { editando = null; ctx.repintar(); } }))
    : null;
  const nueva = h('input', { class: 'entrada', type: 'text', maxlength: '60', placeholder: 'Nueva subcategoría', 'aria-label': 'Nueva subcategoría de ' + c.name, 'data-fk': 'nsub-' + c.id });
  return h('li', { class: 'cat' },
    h('div', { class: 'cat-cab' },
      h('button', { type: 'button', class: 'muestra-btn', 'aria-label': 'Cambiar el color de ' + c.name, 'data-fk': 'col-' + c.id, onclick: () => { editando = 'color-' + c.id; ctx.repintar(); } }, muestra(c.color)),
      formNombre || h('span', { class: 'cat-nom', text: c.name }),
      h('span', { class: 'usos', text: textoUsos(n) }),
      formNombre ? null : h('span', { class: 'acc' },
        h('button', { type: 'button', class: 'enlace', 'data-fk': 'rn-' + c.id, text: 'Cambiar nombre', onclick: () => { editando = 'cat-' + c.id; ctx.repintar(); } }),
        h('button', { type: 'button', class: 'enlace peligro-texto', text: 'Eliminar', onclick: async () => {
          const ok = await confirmar({ titulo: `Eliminar «${c.name}»`, texto: (subs.length ? `Se borran también sus ${subs.length} subcategorías. ` : '') + (n ? `${textoUsos(n)} se quedarán sin categoría.` : 'No la usa ningún movimiento.') });
          if (ok) llamar(ctx, 'DELETE', `/categories/${c.id}`, undefined, 'Categoría eliminada');
        } }))),
    elegirColor,
    h('ul', { class: 'subs' },
      subs.map(s => {
        const fs = renombrar(ctx, 'cat-' + s.id, s.name, v => llamar(ctx, 'PUT', `/categories/${s.id}`, { name: v }, 'Nombre cambiado'), 'Nombre de la subcategoría');
        const ns = I.datos.movements.filter(m => m.category_id === s.id).length;
        return h('li', null, fs || h('span', { text: s.name }), h('span', { class: 'usos', text: textoUsos(ns) }), fs ? null : h('span', { class: 'acc' },
          h('button', { type: 'button', class: 'enlace', 'data-fk': 'rn-' + s.id, text: 'Cambiar nombre', onclick: () => { editando = 'cat-' + s.id; ctx.repintar(); } }),
          h('button', { type: 'button', class: 'enlace peligro-texto', text: 'Eliminar', onclick: async () => {
            const ok = await confirmar({ titulo: `Eliminar «${s.name}»`, texto: ns ? `${textoUsos(ns)} se quedarán sin categoría.` : 'No la usa ningún movimiento.' });
            if (ok) llamar(ctx, 'DELETE', `/categories/${s.id}`, undefined, 'Subcategoría eliminada');
          } })));
      }),
      h('li', { class: 'nueva' }, h('form', { class: 'en-linea', onsubmit: e => { e.preventDefault(); const v = nueva.value.trim(); if (v) llamar(ctx, 'POST', '/categories', { kind: c.kind, name: v, parent_id: c.id }, 'Subcategoría añadida'); } },
        nueva, h('button', { type: 'submit', class: 'boton peque', text: 'Añadir' })))));
}

function seccionCategorias(ctx, kind) {
  const I = ctx.I;
  const nombre = h('input', { class: 'entrada', type: 'text', maxlength: '60', placeholder: kind === 'gasto' ? 'Por ejemplo, Mascotas' : 'Por ejemplo, Alquiler de una habitación', 'aria-label': 'Nombre de la nueva categoría', 'data-fk': 'ncat-' + kind });
  const usados = new Set(I.catsRaiz(kind).map(c => c.color));
  const libre = (COLORES.find(([k]) => !usados.has(k)) || COLORES[0])[0];
  return h('section', { class: 'seccion' },
    h('div', { class: 'seccion-cab' }, h('h2', { text: kind === 'gasto' ? 'Categorías de gastos' : 'Categorías de ingresos' })),
    h('ul', { class: 'cats' }, I.catsRaiz(kind).map(c => bloqueCategoria(ctx, c))),
    h('form', { class: 'en-linea nueva-cat', onsubmit: e => { e.preventDefault(); const v = nombre.value.trim(); if (v) llamar(ctx, 'POST', '/categories', { kind, name: v, color: libre }, 'Categoría añadida'); } },
      nombre, h('button', { type: 'submit', class: 'boton', text: 'Añadir categoría' })));
}

function seccionTipos(ctx) {
  const I = ctx.I;
  const tipos = [...I.tipos.values()].sort((a, b) => a.sort - b.sort);
  const nuevo = h('input', { class: 'entrada', type: 'text', maxlength: '40', placeholder: 'Por ejemplo, Capricho', 'aria-label': 'Nombre del nuevo tipo', 'data-fk': 'ntipo' });
  return h('section', { class: 'seccion' },
    h('div', { class: 'seccion-cab' }, h('h2', { text: 'Tipos de gasto' }), h('p', { text: 'Otra forma de clasificar: fijo, variable, deuda… Los que cuentan como deuda aparecen en Deudas.' })),
    h('ul', { class: 'tipos' }, tipos.map(t => {
      const n = I.datos.movements.filter(m => m.type_id === t.id).length;
      const fr = renombrar(ctx, 'tipo-' + t.id, t.name, v => llamar(ctx, 'PUT', `/types/${t.id}`, { name: v }, 'Nombre cambiado'), 'Nombre del tipo');
      const cas = h('input', { type: 'checkbox', checked: !!t.is_debt, 'data-fk': 'deuda-' + t.id });
      cas.addEventListener('change', () => llamar(ctx, 'PUT', `/types/${t.id}`, { is_debt: cas.checked }, cas.checked ? `«${t.name}» cuenta como deuda` : `«${t.name}» ya no cuenta como deuda`));
      return h('li', null, fr || h('span', { class: 'cat-nom', text: t.name }), h('label', { class: 'casilla' }, cas, 'Cuenta como deuda'), h('span', { class: 'usos', text: textoUsos(n) }),
        fr ? null : h('span', { class: 'acc' },
          h('button', { type: 'button', class: 'enlace', 'data-fk': 'rnt-' + t.id, text: 'Cambiar nombre', onclick: () => { editando = 'tipo-' + t.id; ctx.repintar(); } }),
          h('button', { type: 'button', class: 'enlace peligro-texto', text: 'Eliminar', onclick: async () => {
            const ok = await confirmar({ titulo: `Eliminar «${t.name}»`, texto: n ? `${textoUsos(n)} se quedarán sin tipo.` : 'No lo usa ningún gasto.' });
            if (ok) llamar(ctx, 'DELETE', `/types/${t.id}`, undefined, 'Tipo eliminado');
          } })));
    })),
    h('form', { class: 'en-linea', onsubmit: e => { e.preventDefault(); const v = nuevo.value.trim(); if (v) llamar(ctx, 'POST', '/types', { name: v, is_debt: false }, 'Tipo añadido'); } },
      nuevo, h('button', { type: 'submit', class: 'boton', text: 'Añadir tipo' })));
}

export function render(main, ctx) {
  main.append(cabecera('Categorías', 'Ordena tus gastos e ingresos. Cada categoría puede tener subcategorías, y su color es el que verás en el resumen.'));
  main.append(h('div', { class: 'dos' }, seccionCategorias(ctx, 'gasto'), h('div', { class: 'columna' }, seccionCategorias(ctx, 'ingreso'), seccionTipos(ctx))));
}
