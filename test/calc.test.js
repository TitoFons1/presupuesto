// Pruebas del motor de cálculo que usa el navegador (public/js/calc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexar, importe, resumen, deudas, renta, mesesPlan } from '../public/js/calc.js';
import { parseEur, eur } from '../public/js/ui.js';

const datos = {
  categories: [{ id: 1, kind: 'gasto', name: 'Casa', parent_id: null, color: 'c1', sort: 0 }, { id: 2, kind: 'gasto', name: 'Suministros', parent_id: 1, color: 'c1', sort: 0 }],
  types: [{ id: 1, name: 'Deuda', is_debt: 1, sort: 0 }],
  movements: [
    { id: 1, kind: 'ingreso', name: 'Nómina', amount: 150000, category_id: null, type_id: null, parent_id: null, start_month: '2027-01', end_month: null, every: 1, overrides: {} },
    { id: 2, kind: 'ingreso', name: 'Paga extra', amount: 100000, category_id: null, type_id: null, parent_id: null, start_month: '2027-06', end_month: null, every: 6, overrides: {} },
    { id: 10, kind: 'gasto', name: 'Suministros', amount: 99999, category_id: 2, type_id: null, parent_id: null, start_month: '2027-01', end_month: null, every: 1, overrides: {} },
    { id: 11, kind: 'gasto', name: 'Luz', amount: 3000, category_id: null, type_id: null, parent_id: 10, start_month: '2027-01', end_month: null, every: 1, overrides: {} },
    { id: 12, kind: 'gasto', name: 'Agua', amount: 4000, category_id: null, type_id: null, parent_id: 10, start_month: '2027-01', end_month: null, every: 2, overrides: { '2027-03': 0 } },
    { id: 20, kind: 'gasto', name: 'Préstamo', amount: 10000, category_id: null, type_id: 1, parent_id: null, start_month: '2027-01', end_month: '2027-04', every: 1, overrides: {} },
  ],
  plan: { '2027-01': 5000 },
  settings: { plan_start: '2027-01', plan_end: '2027-12' },
};
const I = indexar(datos);

test('un gasto compuesto suma sus subgastos e ignora su propio importe', () => {
  const s = I.movs.get(10);
  assert.equal(importe(I, s, '2027-01'), 7000); // luz + agua
  assert.equal(importe(I, s, '2027-02'), 3000); // el agua es cada 2 meses
  assert.equal(importe(I, s, '2027-03'), 3000); // marzo: agua con importe especial 0
  assert.equal(importe(I, s, '2027-05'), 7000);
});

test('resumen del mes y reparto por categoría heredada', () => {
  const r = resumen(I, '2027-01');
  assert.equal(r.ing, 150000);
  assert.equal(r.gas, 17000);
  assert.equal(r.queda, 150000 - 17000 - 5000);
  assert.equal(r.porCat.get(1), 7000); // Luz y Agua heredan «Suministros», que cuelga de «Casa»
  assert.equal(resumen(I, '2027-06').ing, 250000);
});

test('deudas: cuotas pendientes y último pago', () => {
  const [d] = deudas(I);
  assert.equal(d.fin, '2027-04');
  assert.equal(d.libera, 10000);
});

test('plan de meses', () => {
  assert.equal(mesesPlan(I).length, 12);
});

test('renta: por debajo de 22.000 € no hay obligación de declarar', () => {
  const r = renta({ rit: 2174000, ss: 141300, ret: 248900, otros: 11200 });
  assert.equal(r.obligado, false);
  assert.equal(r.res, 21692);
  assert.equal(renta({ rit: 2289746, ss: 149580, ret: 263321, otros: 0 }).obligado, true);
});

test('lectura de importes escritos a mano', () => {
  assert.equal(parseEur('1.385,94'), 138594);
  assert.equal(parseEur('27,28 €'), 2728);
  assert.equal(parseEur('27.28'), 2728);
  assert.equal(parseEur('1.000'), 100000);
  assert.ok(Number.isNaN(parseEur('abc')));
  assert.equal(eur(138594), '1.385,94 €');
});
