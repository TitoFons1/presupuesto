// Aplica el tema guardado antes de pintar, para evitar un parpadeo.
try {
  var t = localStorage.getItem('presupuesto-tema');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* sin almacenamiento */ }
