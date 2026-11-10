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
| Ajustes | Tema claro u oscuro, cambiar contraseña, compartir tu presupuesto con otras personas y copias de seguridad |
| Entrar y registrarse | Inicio de sesión y, si está activado, creación de cuentas nuevas, cada una con su presupuesto |

### Cómo funcionan los gastos

- **Frecuencia:** una sola vez, cada mes, cada 2, 3, 4 o 6 meses, o cada año, con primer y último mes.
- **Importes especiales:** un mes concreto puede costar otra cantidad, o nada (0).
- **Gastos compuestos (cascada):** cualquier gasto puede tener subgastos, hasta 5 niveles. El gasto principal vale la suma de sus subgastos de cada mes. Si borras el principal, se borran sus subgastos. Un subgasto sin categoría o sin tipo hereda los del principal.
- **Deshacer:** al borrar un gasto (con sus subgastos) o quitarlo de un mes, el aviso ofrece «Deshacer» durante unos segundos.

### Cómo se conectan las vistas

- El botón **Añadir** (en el móvil, el botón redondo **+**) abre el mismo formulario desde cualquier vista; arriba eliges si es un gasto o un ingreso.
- En el resumen, tocar una categoría abre la lista de gastos filtrada por ella. Tocar algo de «Lo que viene» abre ese gasto.
- En Mes, tocar el nombre de una categoría lleva a su lista; tocar un gasto lo edita solo para ese mes o para todos.
- Resumen, Mes y Ahorro comparten el mes elegido.

## En el móvil

- Barra inferior con Resumen, Mes, Gastos y Ahorro; el resto está en **Más**.
- En Resumen y Mes, desliza el dedo a izquierda o derecha para cambiar de mes.
- Los formularios se abren desde abajo, con el botón de guardar siempre a mano.
- **Instalarla como app:** en el iPhone, Safari → Compartir → «Añadir a pantalla de inicio». En Android, Chrome → menú → «Instalar aplicación» o «Añadir a pantalla de inicio». Se abre a pantalla completa, sin la barra del navegador.

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

## Cuentas y presupuestos

Todo se guarda en el servidor, en la base de datos SQLite `/data/presupuesto.db` del volumen `presupuesto-datos`: cuentas, gastos, ingresos, categorías, tipos, plan de ahorro, cifras de Hacienda y el tema elegido por cada cuenta. En el navegador solo queda una copia del tema para pintar la página sin parpadeos.

- **Registrarse** («¿Aún no tienes cuenta? Crea una», en la pantalla de entrada) crea una cuenta con **su propio presupuesto**, vacío y con las categorías por defecto. Nadie más lo ve.
- **Compartir** (Ajustes → Personas que comparten tu presupuesto) crea una cuenta que ve y cambia **tu** presupuesto, por ejemplo para tu pareja.
- El registro se controla con dos variables:

| `REGISTRO` | Qué pasa |
|---|---|
| `codigo` (por defecto) | Para registrarse hace falta el código de `REGISTRO_CODIGO`. Si el código está vacío, el registro queda cerrado. |
| `abierto` | Cualquiera con el enlace puede crearse una cuenta. No es recomendable si la app está en Internet. |
| `cerrado` | No aparece la opción de registrarse. |

Como mucho se crean 5 cuentas por conexión y hora, y los códigos incorrectos cuentan como intentos fallidos.

## Actualizar a una versión nueva

1. Por si acaso, descarga una copia desde **Ajustes → Descargar copia**.
2. Sube los cambios a Git y en Portainer pulsa **Pull and redeploy** en el stack (en la opción B, vuelve a construir la imagen y actualiza el stack).
3. Al arrancar, la app actualiza la base de datos sola si hace falta. Antes guarda una copia del archivo anterior en el mismo volumen (`presupuesto-antes-de-actualizar-AAAA-MM-DD.db`) y lo indica en los logs.

## Copias de seguridad

- Desde la app: **Ajustes → Descargar copia** genera un JSON con tu presupuesto. Con **Restaurar una copia** lo vuelves a cargar (sustituye los datos de tu presupuesto; no toca las cuentas ni otros presupuestos).
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
