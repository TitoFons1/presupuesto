# Presupuesto

Aplicación web para llevar tu presupuesto personal en tu propio servidor: gastos e ingresos (con categorías, subcategorías, tipos de gasto y gastos compuestos de otros gastos), plan de ahorro, deudas y estimación de la renta. Tiene inicio de sesión y guarda todo en una base de datos SQLite dentro de un volumen de Docker.

## Vistas

| Vista | Para qué sirve |
|---|---|
| Resumen | El mes elegido contado en una frase, lo que te queda cada mes, adónde va el dinero y lo que viene en los próximos seis meses |
| Mes | Entra, sale, ahorras y te queda; gastos agrupados por categoría con sus subgastos desplegables |
| Gastos | Todos los gastos en árbol, con filtros por texto, categoría y tipo; añadir, editar, borrar y añadir subgastos |
| Ingresos | Lo mismo para los ingresos |
| Ahorro | Plan mes a mes editable, gráfico del ahorro acumulado y duración del plan |
| Deudas | Cada deuda con su último pago, lo que queda por pagar y lo que te libera al terminar |
| Hacienda | Estimación de la renta (escalas estatal y de Aragón) y si estás obligado a declarar |
| Categorías | Categorías y subcategorías de gastos e ingresos, colores y tipos de gasto (y cuáles cuentan como deuda) |
| Ajustes | Tema claro u oscuro, cambiar contraseña, dar acceso a otras personas y copias de seguridad |

### Cómo funcionan los gastos

- **Frecuencia:** una sola vez, cada mes, cada 2, 3, 4 o 6 meses, o cada año, con primer y último mes.
- **Importes especiales:** un mes concreto puede costar otra cantidad, o nada (0).
- **Gastos compuestos (cascada):** cualquier gasto puede tener subgastos, hasta 5 niveles. El gasto principal vale la suma de sus subgastos de cada mes. Si borras el principal, se borran sus subgastos. Un subgasto sin categoría o sin tipo hereda los del principal.

## Probarla en tu ordenador

Necesitas Node.js 22 o superior.

```bash
npm install
npm test                         # 13 pruebas: API, inicio de sesión, cascada, cálculos
ADMIN_USER=roberto ADMIN_PASSWORD=una-contraseña-larga npm start
```

Abre `http://localhost:3000`. Los datos se guardan en `./data/presupuesto.db`.

## Desplegar en el servidor con Portainer

### Opción A: desde un repositorio Git (recomendada)

1. Sube **solo esta carpeta** (`presupuesto-app`) a un repositorio privado (GitHub, GitLab o Gitea). El `.gitignore` ya deja fuera `node_modules`, la base de datos y `datos-iniciales.json`.
2. En Portainer: **Stacks → Add stack → Repository**.
   - Repository URL: la de tu repositorio.
   - Repository reference: `refs/heads/main`.
   - Compose path: `docker-compose.yml`.
   - Si el repositorio es privado, activa **Authentication** con tu usuario y un token de acceso.
3. En **Environment variables** añade (mira `.env.example`):
   - `ADMIN_USER`: tu usuario.
   - `ADMIN_PASSWORD`: una contraseña larga. Solo se usa la primera vez.
   - `APP_PORT`: el puerto del servidor, por ejemplo `8085`.
4. Pulsa **Deploy the stack**. Portainer construye la imagen y arranca el contenedor.
5. En **Containers → presupuesto → Logs** debe aparecer `Presupuesto escuchando en el puerto 3000`. Si dejaste `ADMIN_PASSWORD` vacía, ahí verás la contraseña generada.

Para actualizar después: haz `git push` y en el stack pulsa **Pull and redeploy**. Los datos no se pierden porque están en el volumen `presupuesto-datos`.

### Opción B: sin Git, subiendo la carpeta

1. En tu ordenador, desde la carpeta `nominas`, crea el paquete (PowerShell):
   ```powershell
   tar -czf presupuesto-app.tar.gz --exclude=node_modules --exclude=data --exclude=datos-iniciales.json -C presupuesto-app .
   ```
2. En Portainer: **Images → Build a new image**, nombre `presupuesto:latest`, pestaña **Upload**, elige `presupuesto-app.tar.gz` y pulsa **Build the image**.
3. **Stacks → Add stack → Web editor** y pega esto (sin `build`):
   ```yaml
   services:
     presupuesto:
       image: presupuesto:latest
       container_name: presupuesto
       restart: unless-stopped
       environment:
         ADMIN_USER: roberto
         ADMIN_PASSWORD: pon-una-contraseña-larga
         COOKIE_SECURE: auto
         TZ: Europe/Madrid
       volumes:
         - presupuesto-datos:/data
       ports:
         - "8085:3000"
   volumes:
     presupuesto-datos:
   ```

## Ponerle tu dominio con Cloudflare Tunnel

En Cloudflare Zero Trust: **Networks → Tunnels →** tu túnel **→ Public hostnames → Add a public hostname**.

- Subdominio y dominio: el que quieras, por ejemplo `cuentas.tudominio.com`.
- Service: **HTTP**.
- URL:
  - si `cloudflared` corre en el propio servidor o en otro contenedor: `IP-DEL-SERVIDOR:8085` (o `localhost:8085` si `cloudflared` está instalado en el host);
  - si añades `cloudflared` a este mismo stack (está comentado en `docker-compose.yml`): `presupuesto:3000`. En ese caso puedes quitar `ports` para que la app no quede expuesta en la red local.

La app detrás del túnel pone la cookie de sesión como segura automáticamente (`COOKIE_SECURE=auto`). Si quieres una capa más, puedes añadir una aplicación de **Cloudflare Access** delante del hostname (por ejemplo, con código por correo).

## Primer uso

1. Entra con el usuario y la contraseña de `ADMIN_USER` y `ADMIN_PASSWORD` (o la de los logs).
2. Cambia la contraseña en **Ajustes → Tu contraseña**.
3. Para cargar tu presupuesto actual: **Ajustes → Copia de seguridad → Restaurar una copia** y elige `datos-iniciales.json` (está en tu ordenador, no en el repositorio).

## Copias de seguridad

- Desde la app: **Ajustes → Descargar copia** genera un JSON con todo. Con **Restaurar una copia** lo vuelves a cargar (sustituye los datos, no las cuentas de acceso).
- Desde Docker: los datos están en el volumen `presupuesto-datos` (`/data/presupuesto.db`).

## Seguridad

- Contraseñas guardadas con scrypt; sesiones de 30 días en cookie `HttpOnly` y `SameSite=Lax`.
- Tras 8 intentos fallidos de inicio de sesión desde una IP, se bloquea 15 minutos.
- Las escrituras exigen una cabecera propia de la app, así que otra web no puede enviar formularios en tu nombre.
- Cabeceras de seguridad estrictas (CSP sin scripts externos, sin iframes). Las fuentes se sirven desde el propio servidor.
- El contenedor se ejecuta con el usuario sin privilegios `node`.

## Estructura

```
server/   API (Express 5), base de datos (better-sqlite3), sesiones
public/   interfaz: HTML, CSS y JavaScript sin compilación
test/     pruebas con node:test
```

Fuentes: Bricolage Grotesque y Public Sans, licencia SIL Open Font License (ver `public/fonts`).
"# presupuesto" 
