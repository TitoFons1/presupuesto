// Gráfico de columnas de una serie, con valores negativos, tooltip y selección.
import { h, eurCorto, eur } from './ui.js';

const PASOS = [1, 2, 2.5, 5];
function paso(rangoEuros) {
  const bruto = Math.max(rangoEuros, 1) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const f of PASOS) if (f * p >= bruto) return f * p;
  return 10 * p;
}
const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const textoEje = v => (v < 0 ? '−' : '') + (Math.abs(v) >= 10000 ? miles(Math.round(Math.abs(v) / 1000)) + ' mil' : miles(Math.abs(v)));

/**
 * puntos: [{ k, etiqueta, valor (céntimos), lineas: [texto] }]
 * opciones: { sel, alElegir(k), descripcion, rotular: 'ultimo' | 'ninguno' }
 */
export function columnas(puntos, { sel, alElegir, descripcion, rotular = 'ultimo' } = {}) {
  const cont = h('div', { class: 'grafico' });
  const lienzo = h('div', { class: 'lienzo' });
  const burbuja = h('div', { class: 'burbuja', hidden: true, 'aria-hidden': 'true' });
  cont.append(lienzo, burbuja);
  let geo = null, ancho = 0;

  function dibujar() {
    const W = Math.max(260, Math.floor(lienzo.clientWidth || 640));
    if (W === ancho && geo) return;
    ancho = W;
    const H = 230, L = 54, R = 8, T = 22, B = 28;
    const vals = puntos.map(p => p.valor / 100);
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    const st = paso(max - min);
    const top = Math.max(st, Math.ceil(max / st) * st), bot = Math.min(0, Math.floor(min / st) * st);
    const ih = H - T - B, iw = W - L - R, banda = iw / Math.max(1, puntos.length);
    const bw = Math.min(24, Math.max(6, banda * 0.58));
    const y = v => T + ((top - v) / (top - bot || 1)) * ih;
    const y0 = Math.round(y(0)) + 0.5;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${descripcion || 'Gráfico'}">`;
    for (let v = bot; v <= top + 1e-9; v += st) {
      const yy = Math.round(y(v)) + 0.5;
      if (Math.abs(v) > 1e-9) s += `<line class="rej" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      s += `<text class="eje" x="${L - 8}" y="${yy + 4}" text-anchor="end">${textoEje(Math.round(v))}</text>`;
    }
    s += `<line class="base" x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}"/>`;
    const cada = banda < 30 ? 2 : 1;
    puntos.forEach((p, i) => {
      const v = p.valor / 100, cx = L + banda * i + banda / 2, x = cx - bw / 2;
      const yv = y(v), alto = Math.abs(yv - y(0)), r = Math.min(4, alto);
      const clase = 'barra' + (v < 0 ? ' neg' : '') + (p.k === sel ? ' sel' : '');
      if (alto >= 0.5) {
        if (v >= 0) s += `<path class="${clase}" d="M${x},${y0} V${yv + r} Q${x},${yv} ${x + r},${yv} H${x + bw - r} Q${x + bw},${yv} ${x + bw},${yv + r} V${y0} Z"/>`;
        else s += `<path class="${clase}" d="M${x},${y0} V${yv - r} Q${x},${yv} ${x + r},${yv} H${x + bw - r} Q${x + bw},${yv} ${x + bw},${yv - r} V${y0} Z"/>`;
      }
      if (i % cada === 0 || i === puntos.length - 1) s += `<text class="eje" x="${cx}" y="${H - 8}" text-anchor="middle">${p.etiqueta}</text>`;
    });
    if (rotular === 'ultimo' && puntos.length) {
      const i = puntos.length - 1, p = puntos[i], v = p.valor / 100;
      const cx = L + banda * i + banda / 2;
      const yy = v >= 0 ? y(v) - 8 : y(v) + 16;
      s += `<text class="rotulo" x="${cx + bw / 2}" y="${yy}" text-anchor="end">${eurCorto(p.valor)}</text>`;
    }
    puntos.forEach((p, i) => {
      s += `<rect class="zona" x="${L + banda * i}" y="${T}" width="${banda}" height="${ih}" data-i="${i}" tabindex="0" role="button" aria-label="${p.etiquetaLarga || p.etiqueta}: ${eur(p.valor)}"/>`;
    });
    s += '</svg>';
    lienzo.innerHTML = s;
    geo = { L, banda, y };
  }

  function mostrar(i) {
    const p = puntos[i];
    if (!p || !geo) return;
    burbuja.replaceChildren(h('b', { text: p.etiquetaLarga || p.etiqueta }), ...(p.lineas || [eur(p.valor)]).flatMap((l, j) => (j ? [h('br'), l] : [l])));
    burbuja.hidden = false;
    const svg = lienzo.querySelector('svg');
    const rs = svg.getBoundingClientRect(), rc = cont.getBoundingClientRect();
    const cx = rs.left - rc.left + geo.L + geo.banda * i + geo.banda / 2;
    const top = rs.top - rc.top + Math.min(geo.y(p.valor / 100), geo.y(0)) - 10;
    const w = burbuja.offsetWidth, hh = burbuja.offsetHeight;
    burbuja.style.left = Math.max(0, Math.min(rc.width - w, cx - w / 2)) + 'px';
    burbuja.style.top = Math.max(0, top - hh) + 'px';
  }
  const ocultar = () => { burbuja.hidden = true; };
  const indice = e => { const z = e.target.closest('.zona'); return z ? +z.dataset.i : -1; };
  lienzo.addEventListener('pointermove', e => { const i = indice(e); if (i >= 0) mostrar(i); else ocultar(); });
  lienzo.addEventListener('pointerleave', ocultar);
  lienzo.addEventListener('focusin', e => { const i = indice(e); if (i >= 0) mostrar(i); });
  lienzo.addEventListener('focusout', ocultar);
  lienzo.addEventListener('click', e => { const i = indice(e); if (i >= 0 && alElegir) alElegir(puntos[i].k); });
  lienzo.addEventListener('keydown', e => {
    const i = indice(e);
    if (i >= 0 && alElegir && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alElegir(puntos[i].k); }
  });
  if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(dibujar)).observe(lienzo);
  requestAnimationFrame(dibujar);
  return cont;
}
