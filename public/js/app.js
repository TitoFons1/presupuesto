import { h, aviso, esMes, mesHoy, sumarMeses, icono, dialogo, guardarLocal } from './ui.js';
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
  resumen: { titulo: 'Resumen', render: renderResumen, icono: 'resumen' },
  mes: { titulo: 'Mes', render: renderMes, icono: 'mes' },
  gastos: { titulo: 'Gastos', render: gastos.render, icono: 'gastos' },
  ingresos: { titulo: 'Ingresos', render: ingresos.render },
  ahorro: { titulo: 'Ahorro', render: renderAhorro, icono: 'ahorro' },
  deudas: { titulo: 'Deudas', render: renderDeudas },
  hacienda: { titulo: 'Hacienda', render: renderHacienda },
  categorias: { titulo: 'Categorías', render: renderCategorias },
  ajustes: { titulo: 'Ajustes', render: renderAjustes },
};
// En el móvil, estas cuatro van en la barra inferior; el resto, en «Más».
const PRINCIPALES = ['resumen', 'mes', 'gastos', 'ahorro'];
const SECUNDARIAS = Object.keys(VISTAS).filter(v => !PRINCIPALES.includes(v));
const DESCRIPCION = {
  ingresos: 'Nómina, pagas extra y otros ingresos',
  deudas: 'Cuándo termina cada pago',
  hacienda: 'Estimación de la renta',
  categorias: 'Categorías, subcategorías y tipos de gasto',
  ajustes: 'Tema, contraseña, accesos y copias',
};

const estado = { user: null, I: null, mes: null, vistaPrevia: null };

const ctx = {
  get I() { return estado.I; },
  get mes() { return estado.mes; },
  get user() { return estado.user; },
  get vista() { return ruta().vista; },
  setMes(k) {
    if (!mesesPlan(estado.I).includes(k)) return;
    estado.mes = k;
    if (ruta().vista === 'mes') history.replaceState(null, '', '#/mes/' + k);
    pintar();
  },
  irA(hash) { location.hash = hash; },
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

function anadir() {
  ctx.abrirMovimiento({ kind: ruta().vista === 'ingresos' ? 'ingreso' : 'gasto', mes: estado.mes });
}

function abrirMas() {
  const d = dialogo({
    titulo: 'Más', clase: 'hoja-mas', enfocar: false,
    cuerpo: [
      h('ul', { class: 'lista-mas' }, SECUNDARIAS.map(id => h('li', null,
        h('a', { href: '#/' + id, 'aria-current': ruta().vista === id ? 'page' : null, onclick: () => d.cerrar() },
          h('span', { class: 'mas-tit', text: VISTAS[id].titulo }), h('span', { class: 'mas-sub', text: DESCRIPCION[id] }))))),
      h('div', { class: 'mas-pie' }, h('span', { text: `Has entrado como ${estado.user.username}` }),
        h('button', { type: 'button', class: 'boton', text: 'Salir', onclick: () => { d.cerrar(); salir(); } })),
    ],
  });
}

function montarApp() {
  const app = document.getElementById('app');
  app.className = 'app';
  const enlaces = Object.entries(VISTAS).map(([id, v]) => h('a', { href: '#/' + id, 'data-vista': id, text: v.titulo }));
  const inferior = h('nav', { class: 'barra-inferior', 'aria-label': 'Secciones principales' },
    PRINCIPALES.map(id => h('a', { href: '#/' + id, 'data-vista': id }, icono(VISTAS[id].icono), h('span', { text: VISTAS[id].titulo }))),
    h('button', { type: 'button', class: 'boton-mas', 'data-vista': 'mas', 'aria-haspopup': 'dialog', onclick: abrirMas }, icono('mas'), h('span', { text: 'Más' })));
  app.replaceChildren(
    h('button', { type: 'button', class: 'saltar', text: 'Ir al contenido', onclick: () => document.getElementById('vista').focus() }),
    h('header', { class: 'cabecera' }, h('div', { class: 'cabecera-in' },
      h('a', { class: 'marca', href: '#/resumen' }, h('span', { class: 'marca-signo', 'aria-hidden': 'true' }), 'Presupuesto'),
      h('nav', { class: 'nav', 'aria-label': 'Secciones' }, enlaces),
      h('div', { class: 'usuario' },
        h('button', { type: 'button', class: 'boton principal peque anadir-cab', onclick: anadir }, icono('sumar'), 'Añadir'),
        h('span', { class: 'quien', text: estado.user.username }),
        h('button', { type: 'button', class: 'boton sutil peque salir-cab', text: 'Salir', onclick: salir })))),
    h('main', { id: 'vista', class: 'vista', tabindex: '-1' }),
    h('button', { type: 'button', class: 'fab', 'aria-label': 'Añadir un gasto o un ingreso', onclick: anadir }, icono('sumar')),
    inferior);
  activarDeslizar(document.getElementById('vista'));
}

// Deslizar a izquierda o derecha en Resumen y Mes cambia de mes.
function activarDeslizar(main) {
  let ini = null;
  main.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !['resumen', 'mes'].includes(ruta().vista)) { ini = null; return; }
    if (e.target.closest('input, select, textarea, .tabla-env')) { ini = null; return; }
    ini = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  main.addEventListener('pointerup', e => {
    if (!ini || e.pointerType !== 'touch') return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y, dt = Date.now() - ini.t;
    ini = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || dt > 700) return;
    const destino = sumarMeses(estado.mes, dx < 0 ? 1 : -1);
    if (mesesPlan(estado.I).includes(destino)) ctx.setMes(destino);
  });
  main.addEventListener('pointercancel', () => { ini = null; });
}

function pintar() {
  if (!estado.I) return;
  const { vista, param } = ruta();
  if (vista === 'mes' && param && esMes(param) && mesesPlan(estado.I).includes(param)) estado.mes = param;
  for (const a of document.querySelectorAll('.nav a, .barra-inferior a')) {
    if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const mas = document.querySelector('.boton-mas');
  if (mas) mas.classList.toggle('activo', SECUNDARIAS.includes(vista));
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

let modoRegistro = null; // 'abierto' | 'codigo' | 'cerrado', según el servidor

// Pantalla de entrada. modo: 'entrar' o 'registro'.
async function pantallaAcceso(mensaje, modo = 'entrar') {
  if (modoRegistro === null) {
    try { modoRegistro = (await api('GET', '/config')).registro; } catch { modoRegistro = 'cerrado'; }
  }
  if (modoRegistro === 'cerrado') modo = 'entrar';
  const registro = modo === 'registro';
  const app = document.getElementById('app');
  app.className = 'acceso';
  document.title = (registro ? 'Crear cuenta' : 'Entrar') + ' | Presupuesto';
  const usuario = h('input', { class: 'entrada', id: 'acc-user', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '40', required: true });
  const pw = h('input', { class: 'entrada', id: 'acc-pw', type: 'password', autocomplete: registro ? 'new-password' : 'current-password', required: true });
  const pw2 = registro ? h('input', { class: 'entrada', id: 'acc-pw2', type: 'password', autocomplete: 'new-password', required: true }) : null;
  const codigo = registro && modoRegistro === 'codigo' ? h('input', { class: 'entrada', id: 'acc-cod', type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', required: true }) : null;
  const salida = mensaje && mensaje.startsWith('Has salido');
  const error = h('p', { class: 'error', role: 'alert', hidden: !mensaje || salida, text: mensaje || '' });
  const textoBoton = registro ? 'Crear cuenta' : 'Entrar';
  const boton = h('button', { type: 'submit', class: 'boton principal ancho', text: textoBoton });
  const form = h('form', { novalidate: true },
    registro ? h('p', { class: 'ayuda', text: 'Tendrás tu propio presupuesto, vacío y con categorías para empezar. Nadie más lo verá salvo que le des acceso.' }) : null,
    h('div', { class: 'campo' }, h('label', { for: 'acc-user', text: 'Usuario' }), usuario, registro ? h('small', { text: 'Entre 3 y 40 letras o números. También vale . _ - @' }) : null),
    h('div', { class: 'campo' }, h('label', { for: 'acc-pw', text: 'Contraseña' }), pw, registro ? h('small', { text: 'Al menos 8 caracteres.' }) : null),
    pw2 ? h('div', { class: 'campo' }, h('label', { for: 'acc-pw2', text: 'Repite la contraseña' }), pw2) : null,
    codigo ? h('div', { class: 'campo' }, h('label', { for: 'acc-cod', text: 'Código de invitación' }), codigo, h('small', { text: 'Te lo da quien administra este servidor.' })) : null,
    error, boton);
  const cambio = modoRegistro === 'cerrado' ? null : registro
    ? h('p', { class: 'cambio-acceso' }, '¿Ya tienes cuenta? ', h('button', { type: 'button', class: 'enlace', text: 'Entra', onclick: () => pantallaAcceso(null, 'entrar') }))
    : h('p', { class: 'cambio-acceso' }, '¿Aún no tienes cuenta? ', h('button', { type: 'button', class: 'enlace', text: 'Crea una', onclick: () => pantallaAcceso(null, 'registro') }));
  app.replaceChildren(h('div', { class: 'acceso-in' },
    h('h1', null, h('span', { class: 'marca-signo grande', 'aria-hidden': 'true' }), 'Presupuesto'),
    h('p', { class: 'lema', text: registro ? 'Crea tu cuenta y empieza a llevar tus cuentas.' : 'Lo que entra, lo que sale y lo que te queda cada mes.' }),
    salida ? h('p', { class: 'ayuda', text: mensaje }) : null,
    form, cambio));
  const mal = t => { error.textContent = t; error.hidden = false; };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    error.hidden = true;
    if (!usuario.value.trim() || !pw.value) return mal('Escribe tu usuario y tu contraseña.');
    if (registro) {
      if (pw.value.length < 8) return mal('La contraseña necesita al menos 8 caracteres.');
      if (pw.value !== pw2.value) return mal('Las dos contraseñas no coinciden.');
      if (codigo && !codigo.value.trim()) return mal('Escribe el código de invitación.');
    }
    boton.disabled = true; boton.textContent = registro ? 'Creando tu cuenta…' : 'Entrando…';
    try {
      const r = registro
        ? await api('POST', '/register', { username: usuario.value.trim(), password: pw.value, codigo: codigo ? codigo.value.trim() : undefined })
        : await api('POST', '/login', { username: usuario.value.trim(), password: pw.value });
      estado.user = r.user;
      await iniciar();
      if (registro) aviso(`Cuenta creada. Bienvenido, ${r.user.username}.`);
    } catch (err) {
      mal(err.message);
      boton.disabled = false; boton.textContent = textoBoton;
      if (!registro) pw.select();
    }
  });
  requestAnimationFrame(() => usuario.focus());
}

// El tema elegido se guarda en el servidor con la cuenta; aquí se aplica al entrar.
function aplicarPreferencias(user) {
  const tema = user && user.prefs && user.prefs.tema;
  if (tema) { guardarLocal('tema', tema); aplicarTema(); }
}

async function iniciar() {
  aplicarPreferencias(estado.user);
  await cargar();
  montarApp();
  if (!location.hash) history.replaceState(null, '', '#/resumen');
  pintar();
}

window.addEventListener('hashchange', () => { if (estado.user && estado.I) pintar(); });
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
