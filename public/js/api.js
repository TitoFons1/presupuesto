// Llamadas al servidor. Todas llevan la cabecera que el servidor exige para escribir.
export async function api(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch('/api' + ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'presupuesto' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error('No hay conexión con el servidor. Comprueba tu red y vuelve a intentarlo.');
  }
  let datos = null;
  try { datos = await r.json(); } catch { /* respuesta sin cuerpo */ }
  if (r.status === 401 && ruta !== '/login' && ruta !== '/me') {
    window.dispatchEvent(new CustomEvent('sesion-terminada'));
  }
  if (!r.ok) {
    const e = new Error((datos && datos.error) || `El servidor respondió con un error (${r.status}).`);
    e.status = r.status;
    throw e;
  }
  return datos;
}
