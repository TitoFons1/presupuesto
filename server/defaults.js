// Categorías y tipos con los que arranca una base de datos vacía.
// Los colores son claves de la paleta (c1..c8); el navegador las traduce
// a un color distinto en modo claro y oscuro.
export const COLORES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

export const CATEGORIAS = [
  { kind: 'gasto', name: 'Vivienda', color: 'c1', subs: ['Alquiler', 'Suministros'] },
  { kind: 'gasto', name: 'Día a día', color: 'c2', subs: ['Comida', 'Limpieza y cuidado personal', 'Transporte'] },
  { kind: 'gasto', name: 'Ocio', color: 'c3', subs: ['Salidas y cafés', 'Suscripciones', 'Deporte'] },
  { kind: 'gasto', name: 'Pagos a personas', color: 'c4', subs: [] },
  { kind: 'gasto', name: 'Regalos y otros', color: 'c5', subs: ['Regalos', 'Otros'] },
  { kind: 'gasto', name: 'Salud', color: 'c6', subs: ['Farmacia', 'Médico'] },
  { kind: 'gasto', name: 'Deudas y plazos', color: 'c7', subs: ['Préstamos', 'Tarjetas', 'Compras a plazos'] },
  { kind: 'gasto', name: 'Impuestos y trámites', color: 'c8', subs: ['Hacienda', 'Trámites'] },
  { kind: 'ingreso', name: 'Trabajo', color: 'c6', subs: ['Nómina', 'Pagas extra'] },
  { kind: 'ingreso', name: 'Otros ingresos', color: 'c1', subs: ['Devoluciones', 'Ventas'] },
];

export const TIPOS = [
  { name: 'Fijo', is_debt: 0 },
  { name: 'Variable', is_debt: 0 },
  { name: 'Deuda', is_debt: 1 },
  { name: 'Ocasional', is_debt: 0 },
];

export function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function finDePlanPorDefecto() {
  const d = new Date();
  return `${d.getFullYear() + 1}-12`;
}
