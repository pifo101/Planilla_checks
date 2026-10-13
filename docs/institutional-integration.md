# Preparacion para integracion institucional

Este documento registra los limites y contratos preparatorios de la adaptacion local de Planillas de Cheques. `pdf-unifier-app` es solamente una referencia y no se modifica para acomodar este modulo.

## Alcance actual

- Planillas conserva Express 5, EJS, SQL Server local, `express-session`, bcrypt, RBAC backend y CSRF.
- El portal institucional conserva su implementacion, MySQL/MariaDB y navegacion actuales sin cambios.
- No existe conexion, sincronizacion ni identificador compartido entre ambas bases.
- No se implementa SSO, intercambio de cookies, tokens, credenciales ni datos obtenidos de `sessionStorage`.
- `INSTITUTIONAL_PORTAL_URL` es una URL publica opcional de navegacion. Solo admite URL absoluta HTTP(S) sin credenciales. No transmite identidad, rol, agencia ni estado de sesion.

## Agencias

Una futura integracion debe relacionar exclusivamente `agencia_codigo` institucional con `agencias.codigo` de Planillas. No debe utilizar IDs numericos, nombres, posiciones de controles ni texto visible completo.

| Codigo compartido |
| --- |
| `001` |
| `002` |
| `004` |
| `005` |
| `006` |
| `007` |
| `008` |
| `009` |
| `010` |
| `011` |

La ausencia de `003` es intencional en el catalogo conocido. Esta fase no modifica datos ni claves foraneas para forzar correspondencias.

## Roles

Las unicas correspondencias confirmadas son:

| Cargo institucional | Rol Planillas |
| --- | --- |
| `Administrador` | `ADMIN` |
| `Asistente de Agencia` | `ASISTENTE` |

`CONTABILIDAD` no tiene equivalente institucional confirmado. No se le asigna uno. Los demas cargos institucionales se consideran sin acceso a Planillas hasta que exista una decision explicita.

Esta tabla no habilita autenticacion cruzada. Planillas sigue validando usuarios, estado, rol y agencia contra SQL Server en cada peticion protegida.

## Fases posteriores pendientes

- Identidad: definir un mecanismo backend verificable de SSO; no confiar en query strings ni almacenamiento del navegador.
- Usuarios: definir alta, vinculacion, bloqueo, baja y fuente de verdad sin compartir contrasenas.
- Roles: confirmar el equivalente institucional de `CONTABILIDAD` y la politica para cargos no mapeados.
- Agencias: validar el catalogo definitivo y el tratamiento de codigos nuevos o inactivos.
- Base de datos: decidir la persistencia definitiva y una migracion controlada; no compartir IDs entre motores.
- Despliegue: definir URL, subruta o reverse proxy sin exigir cambios a la logica interna de Planillas.
- Produccion: definir HTTPS, secretos, almacenamiento persistente de sesiones, observabilidad, respaldo y recuperacion.

## Generacion PDF

La fase local incorpora un generador independiente de SQL Server en `src/services/planilla-pdf.service.js`. Su entrada es un objeto de planilla normalizado por la capa llamadora; el modulo deriva los totales en centavos de los registros incluidos y renderiza un `Buffer` PDF carta horizontal. No importa repositorios, Web Services, sesiones ni APIs del navegador, y no escribe archivos.

`scripts/preview-ui.js` conserva responsabilidades separadas para la demostracion con fixtures ficticios. En la aplicacion principal, `GET /asistente/planillas/:id/pdf` consulta SQL Server con el ID y la agencia de la sesion revalidada; `GET /contabilidad/planillas/:id/pdf` usa el contrato multiagencia exclusivo de CONTABILIDAD. ADMIN no tiene ruta equivalente. Ambos controladores fijan el contexto PDF en el servidor y entregan el `Buffer` sin cache ni archivos temporales.

La autorizacion productiva permanece dentro de Planillas: `requireAuth` revalida la sesion contra SQL Server, cada router exige exclusivamente `ASISTENTE` o `CONTABILIDAD`, y el servicio vuelve a validar rol, ID y agencia antes de consultar. No se confia en query strings, `sessionStorage`, campos de rol enviados por el navegador ni datos procedentes de `pdf-unifier-app`. La futura integracion institucional puede conservar intactos el generador PDF, los servicios de negocio, los repositorios y estas reglas; debe adaptar despliegue, secretos, SQL Server, sesiones y el mecanismo de identidad backend verificable.

Si una fase futura necesitara cambios en `pdf-unifier-app`, esos cambios deben tratarse como una decision institucional separada. La alternativa preferida es resolver compatibilidad mediante configuracion y contratos del lado de Planillas.
