import { h, eur, eurEntero, parseEur, centATexto, aviso, mesLargo } from '../ui.js';
import { renta } from '../calc.js';
import { cabecera } from '../componentes.js';
import { api } from '../api.js';

const CAMPOS = [
  ['rit', 'Sueldo bruto del año', 'Rendimientos íntegros del trabajo, sumando todas las empresas.'],
  ['ss', 'Seguridad Social que pagas tú', 'La suma de las cotizaciones descontadas en tus nóminas.'],
  ['ret', 'IRPF que te han retenido', 'La suma de las retenciones de todas tus nóminas.'],
  ['otros', 'Cobrado de otras empresas', 'Lo que te pagaron empresas que no son la principal. Si pasa de 1.500 €, el límite para declarar baja a 15.876 €.'],
];

export function render(main, ctx) {
  const I = ctx.I;
  const hc = I.ajustes.hacienda || { year: new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0), rit: 0, ss: 0, ret: 0, otros: 0 };
  const year = hc.year;
  main.append(cabecera('Hacienda', `Estimación de la renta de ${year}, que se presenta de abril a junio de ${year + 1}. Cuando Hacienda publique tus datos fiscales, cambia estas cifras.`));

  const guardar = async cambios => {
    try { await api('PUT', '/settings', { hacienda: { ...hc, ...cambios } }); aviso('Cifras de Hacienda guardadas'); await ctx.recargar(); }
    catch (e) { aviso(e.message, 'mal'); }
  };
  const anio = h('input', { class: 'entrada cifra corta', id: 'h-year', type: 'number', min: '2000', max: '2100', value: String(year), 'data-fk': 'h-year' });
  anio.addEventListener('change', () => { const v = Number(anio.value); if (Number.isInteger(v) && v >= 2000 && v <= 2100) guardar({ year: v }); else aviso('Escribe un año, por ejemplo 2026.', 'mal'); });
  const form = h('form', { class: 'hoja-campos', novalidate: true, onsubmit: e => e.preventDefault() },
    h('div', { class: 'campo' }, h('label', { for: 'h-year', text: 'Año de la renta' }), anio),
    CAMPOS.map(([k, et, ayuda]) => {
      const inp = h('input', { class: 'entrada cifra', id: 'h-' + k, 'data-fk': 'h-' + k, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: hc[k] ? centATexto(hc[k]) : '' });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      inp.addEventListener('change', () => {
        const v = inp.value.trim() === '' ? 0 : parseEur(inp.value);
        if (!Number.isFinite(v) || v < 0) { inp.setAttribute('aria-invalid', 'true'); aviso('Escribe una cantidad, por ejemplo 21.740,00.', 'mal'); return; }
        guardar({ [k]: v });
      });
      return h('div', { class: 'campo' }, h('label', { for: inp.id, text: et }), inp, h('small', { text: ayuda }));
    }));

  const salida = h('div', { class: 'renta' });
  if (!(hc.rit > 0)) {
    salida.append(h('div', { class: 'veredicto' }, h('p', { class: 'veredicto-t', text: 'Rellena las cifras para ver la estimación' }), h('p', { text: 'Con el sueldo bruto, la Seguridad Social y el IRPF retenido basta.' })));
  } else {
    const c = renta(hc);
    let clase, titulo, texto;
    if (c.res <= 0) { clase = 'bien'; titulo = c.res < 0 ? `Te devolverían unos ${eurEntero(-c.res)}` : 'Te saldría a cero'; texto = c.res < 0 ? 'Aunque no estés obligado a declarar, te conviene presentarla para cobrar la devolución.' : 'Lo retenido coincide con lo que te toca pagar.'; }
    else if (!c.obligado) { clase = 'bien'; titulo = 'No tendrías que pagar nada'; texto = `No estás obligado a declarar: tu sueldo bruto (${eur(c.rit)}) no llega a ${eur(c.limite)}. Si la presentaras saldría a pagar ${eur(c.res)}, así que no te conviene.`; }
    else { clase = 'justo'; titulo = `Te tocaría pagar unos ${eurEntero(c.res)}`; texto = `Pasas de ${eur(c.limite)}, así que tienes que declarar. Puedes pagarlo en dos plazos sin intereses: 60 % a finales de junio y 40 % en noviembre.`; }
    const pct = Math.min(100, (c.rit / c.limite) * 100);
    const medClase = c.rit > c.limite ? 'mal' : c.rit > c.limite * 0.97 ? 'justo' : '';
    const filas = [
      ['Sueldo bruto', c.rit], ['Seguridad Social', -c.ss], ['Gastos generales', -c.gastos], ['Reducción por rendimientos del trabajo', -c.red],
      ['Base liquidable', c.base, 'sub'], ['Cuota estatal', c.cEst], ['Cuota de Aragón', c.cAut], ['Cuota total', c.cuota, 'sub'],
      ['IRPF ya retenido', -c.ret], [c.res > 0 ? 'Resultado si la presentas: a pagar' : 'Resultado: a devolver', Math.abs(c.res), 'sub'],
    ];
    // Apuntar el resultado como gasto o ingreso
    const nombrePago = `Hacienda: renta ${year}`, nombreDev = `Devolución renta ${year}`;
    const mesPago = `${year + 1}-06`, mesDev = `${year + 1}-07`;
    const existente = I.datos.movements.find(m => m.name === nombrePago || m.name === nombreDev);
    let accion = null;
    if (c.obligado && c.res > 0) accion = { kind: 'gasto', name: nombrePago, amount: Math.ceil(c.res / 100) * 100, mes: mesPago, texto: `Apuntar ${eurEntero(Math.ceil(c.res / 100) * 100)} en gastos de ${mesLargo(mesPago)}` };
    else if (c.res < 0) accion = { kind: 'ingreso', name: nombreDev, amount: -c.res, mes: mesDev, texto: `Apuntar la devolución en ingresos de ${mesLargo(mesDev)}` };
    const apuntar = async () => {
      const cat = I.datos.categories.find(x => x.kind === accion.kind && (accion.kind === 'gasto' ? x.name === 'Hacienda' : x.name === 'Devoluciones'));
      const tipo = [...I.tipos.values()].find(t => t.name === 'Ocasional');
      const cuerpo = { kind: accion.kind, name: accion.name, amount: accion.amount, category_id: cat ? cat.id : null, type_id: accion.kind === 'gasto' && tipo ? tipo.id : null, parent_id: null, start_month: accion.mes, end_month: accion.mes, every: 1, notes: 'Calculado en la vista Hacienda.', overrides: {} };
      try {
        if (existente && existente.kind === accion.kind) await api('PUT', `/movements/${existente.id}`, cuerpo);
        else { if (existente) await api('DELETE', `/movements/${existente.id}`); await api('POST', '/movements', cuerpo); }
        aviso('Apuntado en ' + mesLargo(accion.mes)); await ctx.recargar();
      } catch (e) { aviso(e.message, 'mal'); }
    };
    const yaApuntado = existente && accion && existente.kind === accion.kind && existente.amount === accion.amount && existente.start_month === accion.mes;
    salida.append(
      h('div', { class: 'veredicto ' + clase }, h('p', { class: 'veredicto-t', text: titulo }), h('p', { text: texto })),
      h('div', { class: 'medidor' },
        h('p', { class: 'medidor-t', text: 'Sueldo bruto frente al límite para tener que declarar' }),
        h('div', { class: 'medidor-pista ' + medClase }, h('div', { class: 'medidor-relleno ' + medClase, style: { width: pct.toFixed(1) + '%' } })),
        h('div', { class: 'medidor-pie' }, h('span', { text: `${eur(c.rit)} de ${eur(c.limite)}` }), h('span', { text: c.rit > c.limite ? `Te pasas en ${eur(c.rit - c.limite)}` : `Margen: ${eur(c.limite - c.rit)}` }))),
      h('div', { class: 'tabla-env' }, h('table', { class: 'calculo' }, h('tbody', null, filas.map(([t, v, cl]) => h('tr', { class: cl || null }, h('td', { text: t }), h('td', { class: 'n', text: eur(v) })))))),
      h('div', { class: 'apunte' },
        h('p', { text: existente ? `Tienes apuntado «${existente.name}»: ${eur(existente.amount)} en ${mesLargo(existente.start_month)}.` : 'No tienes nada apuntado para esta renta en tu presupuesto.' }),
        accion && !yaApuntado ? h('button', { type: 'button', class: 'boton', text: accion.texto, onclick: apuntar }) : null));
  }

  main.append(h('div', { class: 'dos hacienda' }, h('section', { class: 'seccion' }, h('h2', { text: 'Tus cifras' }), form), h('section', { class: 'seccion' }, h('h2', { text: 'Resultado' }), salida)));
  main.append(h('p', { class: 'ayuda ancho-texto', text: 'Cálculo aproximado: declaración individual, residencia en Aragón, sin hijos ni deducciones y solo rendimientos del trabajo. Aplica la Seguridad Social, 2.000 € de gastos generales, la reducción por rendimientos del trabajo, el mínimo personal de 5.550 € y las escalas estatal y de Aragón. La cifra definitiva la da el borrador de Renta Web.' }));
}
