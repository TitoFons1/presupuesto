import { h, aviso, esMes, mesHoy } from './ui.js';
import { api } from './api.js';
import { indexar, mesesPlan } from './calc.js';
import { abrirMovimiento } from './formulario.js';
import { aplicarTema, render as renderAjustes } from './views/ajustes.js';
import { render as renderResumen } from './views/resumen.js';
import { render as renderMes } from './views/mes.js';
import { crearVista } from './views/listado.js';
import { render as renderAhorro } from './views/ahorro.js';
import { render as renderDeudas } from './views/deudas.js';
import { render as renderHacienda } from './views/hacienda.js';
import { render as renderCategorias } from './views/categorias.js';

const gastos = crearVista('gasto'), ingresos = crearVista('ingreso');
const VISTAS = {
  resumen: { titulo: 'Resumen', render: renderResumen },
  mes: { titulo: 'Mes', render: renderMes },
  gastos: { titulo: 'Gastos', render: gastos.render },
  ingresos: { titulo: 'Ingresos', render: ingresos.render },
  ahorro: { titulo: 'Ahorro', render: renderAhorro },
  deudas: { titulo: 'Deudas', render: renderDeudas },
  hacienda: { titulo: 'Hacienda', render: renderHacienda },
  categorias: { titulo: 'Categorías', render: renderCategorias },
  ajustes: { titulo: 'Ajustes', render: renderAjustes },
};

const estado = { user: null, I: null, mes: null, vistaPrevia: null };

const ctx = {
  get I() { return estado.I; },
  get mes() { return estado.mes; },
  get user() { return estado.user; },
  setMes(k) {
    if (!mesesPlan(estado.I).includes(k)) return;
    estado.mes = k;
    if (ruta().vista === 'mes') history.replaceState(null, '', '#/mes/' + k);
    pintar();
  },
  repintar: () => pintar(),
  async recargar() {
    try { await cargar(); } catch (e) { aviso(e.message, 'mal'); }
    pintar();
  },
  abrirMovimiento: o => abrirMovimiento(ctx, o),
};

async function cargar() {
  const datos = await api('GET', '/data');
  estado.I = indexar(datos);
  const ms = mesesPlan(estado.I);
  if (!estado.mes || !ms.includes(estado.mes)) {
    const hoy = mesHoy();
    estado.mes = ms.includes(hoy) ? hoy : ms[0];
  }
}

function ruta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  return { vista: VISTAS[partes[0]] ? partes[0] : 'resumen', param: partes[1] || null };
}

function montarApp() {
  const app = document.getElementById('app');
  app.className = 'app';
  const enlaces = Object.entries(VISTAS).map(([id, v]) => h('a', { href: '#/' + id, 'data-vista': id, text: v.titulo }));
  app.replaceChildren(
    h('button', { type: 'button', class: 'saltar', text: 'Ir al contenido', onclick: () => document.getElementById('vista').focus() }),
    h('header', { class: 'cabecera' }, h('div', { class: 'cabecera-in' },
      h('a', { class: 'marca', href: '#/resumen' }, h('span', { class: 'marca-signo', 'aria-hidden': 'true' }), 'Presupuesto'),
      h('nav', { class: 'nav', 'aria-label': 'Secciones' }, enlaces),
      h('div', { class: 'usuario' }, h('span', { class: 'quien', text: estado.user.username }),
        h('button', { type: 'button', class: 'boton sutil peque', text: 'Salir', onclick: salir })))),
    h('main', { id: 'vista', class: 'vista', tabindex: '-1' }));
}

function pintar() {
  if (!estado.I) return;
  const { vista, param } = ruta();
  if (vista === 'mes' && param && esMes(param) && mesesPlan(estado.I).includes(param)) estado.mes = param;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const act = document.activeElement;
  const fk = act && act.dataset ? act.dataset.fk : null;
  const scroll = window.scrollY;
  const main = document.getElementById('vista');
  main.replaceChildren();
  main.dataset.vista = vista;
  document.title = `${VISTAS[vista].titulo} | Presupuesto`;
  try { VISTAS[vista].render(main, ctx); }
  catch (e) { console.error(e); main.replaceChildren(h('p', { class: 'alerta mal', text: 'No se ha podido mostrar esta vista. Recarga la página; si sigue pasando, revisa la consola del navegador.' })); }
  if (estado.vistaPrevia !== vista) {
    if (estado.vistaPrevia !== null) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
    estado.vistaPrevia = vista;
  } else {
    window.scrollTo(0, scroll);
    if (fk) { const n = main.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (n) n.focus({ preventScroll: true }); }
  }
}

async function salir() {
  try { await api('POST', '/logout', {}); } catch { /* da igual */ }
  estado.user = null; estado.I = null; estado.vistaPrevia = null;
  pantallaAcceso('Has salido de tu presupuesto.');
}

function pantallaAcceso(mensaje) {
  const app = document.getElementById('app');
  app.className = 'acceso';
  document.title = 'Entrar | Presupuesto';
  const usuario = h('input', { class: 'entrada', id: 'acc-user', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pw = h('input', { class: 'entrada', id: 'acc-pw', type: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'error', role: 'alert', hidden: !mensaje || mensaje.startsWith('Has salido'), text: mensaje || '' });
  const boton = h('button', { type: 'submit', class: 'boton principal ancho', text: 'Entrar' });
  const form = h('form', { novalidate: true },
    h('div', { class: 'campo' }, h('label', { for: 'acc-user', text: 'Usuario' }), usuario),
    h('div', { class: 'campo' }, h('label', { for: 'acc-pw', text: 'Contraseña' }), pw),
    error, boton);
  app.replaceChildren(h('div', { class: 'acceso-in' },
    h('h1', null, h('span', { class: 'marca-signo grande', 'aria-hidden': 'true' }), 'Presupuesto'),
    h('p', { class: 'lema', text: 'Lo que entra, lo que sale y lo que te queda cada mes.' }),
    mensaje && mensaje.startsWith('Has salido') ? h('p', { class: 'ayuda', text: mensaje }) : null,
    form));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    error.hidden = true;
    if (!usuario.value.trim() || !pw.value) { error.textContent = 'Escribe tu usuario y tu contraseña.'; error.hidden = false; return; }
    boton.disabled = true; boton.textContent = 'Entrando…';
    try {
      const r = await api('POST', '/login', { username: usuario.value.trim(), password: pw.value });
      estado.user = r.user;
      await iniciar();
    } catch (err) {
      error.textContent = err.message; error.hidden = false;
      boton.disabled = false; boton.textContent = 'Entrar';
      pw.select();
    }
  });
  requestAnimationFrame(() => usuario.focus());
}

async function iniciar() {
  await cargar();
  montarApp();
  if (!location.hash) history.replaceState(null, '', '#/resumen');
  pintar();
}

window.addEventListener('hashchange', () => { if (estado.user) pintar(); });
window.addEventListener('sesion-terminada', () => {
  if (!estado.user) return;
  estado.user = null; estado.I = null; estado.vistaPrevia = null;
  document.getElementById('capa').replaceChildren();
  document.body.classList.remove('con-dialogo');
  pantallaAcceso('Tu sesión ha terminado. Vuelve a entrar.');
});

aplicarTema();
(async () => {
  try {
    const r = await api('GET', '/me');
    estado.user = r.user;
    await iniciar();
  } catch (e) {
    if (e.status === 401) pantallaAcceso();
    else {
      const app = document.getElementById('app');
      app.className = 'acceso';
      app.replaceChildren(h('div', { class: 'acceso-in' }, h('h1', { text: 'Presupuesto' }), h('p', { class: 'error', text: e.message }),
        h('button', { type: 'button', class: 'boton', text: 'Volver a intentarlo', onclick: () => location.reload() })));
    }
  }
})();
