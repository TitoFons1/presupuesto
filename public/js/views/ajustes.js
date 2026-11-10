import { h, aviso, confirmar, leerLocal, guardarLocal } from '../ui.js';
import { api } from '../api.js';
import { cabecera } from '../componentes.js';

export function aplicarTema() {
  const t = leerLocal('tema');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

function seccionTema() {
  const actual = leerLocal('tema') || 'sistema';
  const ops = [['sistema', 'Como el sistema'], ['light', 'Claro'], ['dark', 'Oscuro']];
  return h('section', { class: 'seccion' }, h('h2', { text: 'Apariencia' }),
    h('fieldset', null, h('legend', { class: 'sr', text: 'Tema' }), h('div', { class: 'opciones' }, ops.map(([v, t]) => {
      const r = h('input', { type: 'radio', name: 'tema', value: v, checked: v === actual });
      r.addEventListener('change', () => { guardarLocal('tema', v); aplicarTema(); });
      return h('label', { class: 'opcion' }, r, t);
    }))));
}

function seccionPassword() {
  const actual = h('input', { class: 'entrada', id: 'pw-actual', type: 'password', autocomplete: 'current-password' });
  const nueva = h('input', { class: 'entrada', id: 'pw-nueva', type: 'password', autocomplete: 'new-password', minlength: '8' });
  const repite = h('input', { class: 'entrada', id: 'pw-repite', type: 'password', autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const form = h('form', { class: 'hoja-campos', novalidate: true },
    h('div', { class: 'campo' }, h('label', { for: 'pw-actual', text: 'Contraseña actual' }), actual),
    h('div', { class: 'campo' }, h('label', { for: 'pw-nueva', text: 'Contraseña nueva' }), nueva, h('small', { text: 'Al menos 8 caracteres.' })),
    h('div', { class: 'campo' }, h('label', { for: 'pw-repite', text: 'Repite la contraseña nueva' }), repite),
    error, h('div', null, h('button', { type: 'submit', class: 'boton principal', text: 'Cambiar contraseña' })));
  form.addEventListener('submit', async e => {
    e.preventDefault(); error.hidden = true;
    if (nueva.value.length < 8) { error.textContent = 'La contraseña nueva necesita al menos 8 caracteres.'; error.hidden = false; return; }
    if (nueva.value !== repite.value) { error.textContent = 'Las dos contraseñas nuevas no coinciden.'; error.hidden = false; return; }
    try {
      await api('PUT', '/me/password', { current: actual.value, password: nueva.value });
      form.reset(); aviso('Contraseña cambiada. Las demás sesiones se han cerrado.');
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  });
  return h('section', { class: 'seccion' }, h('h2', { text: 'Tu contraseña' }), form);
}

function seccionUsuarios(ctx) {
  const lista = h('ul', { class: 'usuarios' }, h('li', { class: 'ayuda', text: 'Cargando…' }));
  const cargar = async () => {
    try {
      const { users } = await api('GET', '/users');
      lista.replaceChildren(...users.map(u => h('li', null, h('span', { text: u.username }),
        u.id === ctx.user.id ? h('span', { class: 'usos', text: 'Tú' }) : h('button', { type: 'button', class: 'enlace peligro-texto', text: 'Quitar acceso', onclick: async () => {
          if (!(await confirmar({ titulo: `Quitar el acceso a «${u.username}»`, texto: 'No podrá volver a entrar. Tus datos no cambian.', boton: 'Quitar acceso' }))) return;
          try { await api('DELETE', `/users/${u.id}`); aviso('Acceso quitado'); cargar(); } catch (err) { aviso(err.message, 'mal'); }
        } }))));
    } catch (err) { lista.replaceChildren(h('li', { class: 'error', text: err.message })); }
  };
  cargar();
  const usuario = h('input', { class: 'entrada', id: 'nu-user', type: 'text', autocomplete: 'off', maxlength: '40' });
  const pw = h('input', { class: 'entrada', id: 'nu-pw', type: 'password', autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const form = h('form', { class: 'hoja-campos', novalidate: true },
    h('div', { class: 'fila-campos' }, h('div', { class: 'campo' }, h('label', { for: 'nu-user', text: 'Usuario' }), usuario), h('div', { class: 'campo' }, h('label', { for: 'nu-pw', text: 'Contraseña' }), pw)),
    error, h('div', null, h('button', { type: 'submit', class: 'boton', text: 'Dar acceso' })));
  form.addEventListener('submit', async e => {
    e.preventDefault(); error.hidden = true;
    try { await api('POST', '/users', { username: usuario.value.trim(), password: pw.value }); form.reset(); aviso('Acceso creado'); cargar(); }
    catch (err) { error.textContent = err.message; error.hidden = false; }
  });
  return h('section', { class: 'seccion' }, h('h2', { text: 'Personas con acceso' }),
    h('p', { class: 'ayuda', text: 'Todas las cuentas ven y cambian el mismo presupuesto.' }), lista, form);
}

function seccionCopia(ctx) {
  const descargar = async () => {
    try {
      const r = await fetch('/api/export', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('No se ha podido crear la copia.');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `presupuesto-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      aviso('Copia descargada');
    } catch (err) { aviso(err.message, 'mal'); }
  };
  const archivo = h('input', { type: 'file', id: 'copia-archivo', accept: 'application/json,.json', class: 'sr' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    archivo.value = '';
    if (!f) return;
    let datos;
    try { datos = JSON.parse(await f.text()); } catch { aviso('Ese archivo no es una copia válida (no es JSON).', 'mal'); return; }
    const n = Array.isArray(datos.movements) ? datos.movements.length : 0;
    const ok = await confirmar({ titulo: 'Restaurar la copia', texto: `Se sustituirán todos tus gastos, ingresos, categorías, plan de ahorro y cifras de Hacienda por los de «${f.name}» (${n} movimientos). Las cuentas de acceso no cambian.`, boton: 'Restaurar copia' });
    if (!ok) return;
    try { await api('POST', '/import', datos); aviso('Copia restaurada'); await ctx.recargar(); }
    catch (err) { aviso(err.message, 'mal'); }
  });
  return h('section', { class: 'seccion' }, h('h2', { text: 'Copia de seguridad' }),
    h('p', { class: 'ayuda', text: 'Descarga un archivo con todo tu presupuesto para guardarlo o pasarlo a otro servidor.' }),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'boton', text: 'Descargar copia', onclick: descargar }),
      h('label', { class: 'boton', for: 'copia-archivo', tabindex: '0', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); archivo.click(); } } }, 'Restaurar una copia'), archivo));
}

export function render(main, ctx) {
  main.append(cabecera('Ajustes', `Has entrado como ${ctx.user.username}.`));
  main.append(h('div', { class: 'dos' },
    h('div', { class: 'columna' }, seccionTema(), seccionPassword()),
    h('div', { class: 'columna' }, seccionUsuarios(ctx), seccionCopia(ctx))));
}
