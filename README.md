# Planilla Checks

Aplicacion web para administrar planillas de creditos y cheques entre asistentes de agencia, contabilidad y administradores.

## Tecnologias

- Node.js y Express
- EJS
- Bootstrap 5
- `express-session`
- `dotenv`
- `bcrypt` (preparado para la autenticacion real)
- Nodemon para desarrollo

## Requisitos

- Node.js 18 o superior
- npm

## Instalacion

```bash
npm install
```

Copiar `.env.example` como `.env` y cambiar `SESSION_SECRET` para cada ambiente. No se requieren variables de base de datos ni Web Service durante esta etapa.

```bash
npm run dev
```

La aplicacion queda disponible en `http://localhost:3000`. Para ejecucion sin recarga automatica se puede usar `npm start`.

## Estructura general

- `src/config`: configuracion basada en variables de entorno.
- `src/controllers`: logica HTTP y datos mock temporales.
- `src/middleware`: autenticacion y autorizacion por roles, preparadas para activarse posteriormente.
- `src/routes`: definicion de endpoints por modulo.
- `src/services`: integraciones externas aisladas.
- `src/utils`: reglas de calculo reutilizables.
- `src/views`: vistas EJS y parciales del dashboard.
- `public`: CSS, JavaScript e imagenes publicas.
- `database`, `docs` y `tests`: espacios reservados para las siguientes etapas.

## Roles previstos

- `ADMIN`: administra usuarios, roles, agencias y estados.
- `ASISTENTE`: crea planillas y consulta su historial.
- `CONTABILIDAD`: recibe, consulta y posteriormente procesa planillas.

## Estado actual

Esta version implementa la navegacion, vistas responsive y rutas base. El dashboard, usuarios, solicitudes y planillas muestran datos de demostracion identificados en la interfaz. El login es provisional: crea una sesion de demostracion y no valida credenciales.

Todavia no se implementan:

- Conexion a SQL o persistencia.
- Autenticacion real y comparacion de contrasenas con bcrypt.
- Consumo del Web Service externo.
- CRUD de usuarios.
- Envio y procesamiento real de planillas.
- Restriccion efectiva de rutas por rol.

Las reglas de negocio previstas estan documentadas en [`docs/business-rules.md`](docs/business-rules.md).
