# Reglas de negocio pendientes

La consulta actual obtiene datos del Web Service. `Obtener datos` no guarda la solicitud. La asistente puede agregar solicitudes a un borrador temporal mantenido en memoria por el navegador; `Agregar a planilla` tampoco inserta ni envia datos. Al recargar la pagina, este borrador se pierde.

Antes de agregar, Planilla Checks consulta SQL Server para comprobar que el numero de solicitud y el numero de cheque no se hayan utilizado. Tambien evita duplicados dentro del borrador. El historial permanecera en SQL Server cuando se implemente el envio definitivo, que sigue pendiente para la siguiente fase.

Reglas del flujo:

1. El numero de solicitud no puede repetirse despues de haber sido enviado en una planilla.
2. El numero de cheque debe ser unico y nunca reutilizarse.
3. La agencia debe obtenerse del usuario autenticado.
4. La fecha de extraccion debe utilizar la fecha y hora del sistema.
5. El monto aprobado depende de la informacion recibida del Web Service:
   - Sin cancelacion: `montoAprobado = descuentos + montoCheque`.
   - Con cancelacion: `montoAprobado = descuentos + montoCheque + montoCancelado`.
   - Para el proceso actual de Planilla Checks, el campo de descuentos utilizado es Gasto01. Los campos Gasto02-Gasto10 no forman parte del cálculo requerido.
6. La metodologia cuenta unicamente operaciones con `FormaDesembolso = 1`: una es `INDIVIDUAL` y dos o mas son `GRUPAL`.
7. Una planilla puede contener varias solicitudes.
8. Una vez enviada, la planilla debe conservarse historicamente.
9. Contabilidad puede recibir planillas de distintas agencias.
10. Los creditos procesados deben quedar bloqueados para evitar modificaciones accidentales.
11. Los totales del borrador se calculan en centavos enteros y se actualizan al agregar o eliminar solicitudes.
12. `Limpiar` elimina solamente la consulta activa y conserva las solicitudes agregadas al borrador.

## Pendientes de confirmacion del ingeniero

1. Como representar una distribucion que contiene unicamente Abono a prestamo. Actualmente se detecta como no soportada y no se guarda.
2. Confirmacion definitiva de que `Ejecutado === true` representa el estado final requerido. Por seguridad, actualmente se rechaza cualquier otro valor.
3. Como agregar los montos de una distribucion grupal. La metodologia se identifica, pero sus montos no se calculan ni se guardan.
