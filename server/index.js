import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js'; // abre la base de datos y la actualiza si hace falta
import { asegurarAdmin, limpiarSesionesCaducadas, requireAppHeader, modoRegistro } from './auth.js';
import { api, manejarErrores } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);

asegurarAdmin();
const registro = modoRegistro();
console.log(registro === 'abierto' ? 'Registro de cuentas: abierto a cualquiera con el enlace.'
  : registro === 'codigo' ? 'Registro de cuentas: con código de invitación (REGISTRO_CODIGO).'
  : 'Registro de cuentas: desactivado. Para activarlo, define REGISTRO_CODIGO o REGISTRO=abierto.');
limpiarSesionesCaducadas();
setInterval(limpiarSesionesCaducadas, 6 * 60 * 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
// Detrás de Cloudflare Tunnel o de otro proxy en la red de Docker.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
});

app.use('/api', express.json({ limit: '5mb' }), requireAppHeader, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);

app.use(express.static(PUBLIC, {
  index: false,
  setHeaders(res, file) {
    if (file.endsWith('.woff2')) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    else res.set('Cache-Control', 'no-cache');
  },
}));

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

app.use((req, res) => res.status(404).type('text').send('No encontrado'));
app.use(manejarErrores);

const server = app.listen(PORT, () => console.log(`Presupuesto escuchando en el puerto ${PORT}`));
const parar = () => server.close(() => process.exit(0));
process.on('SIGTERM', parar);
process.on('SIGINT', parar);
