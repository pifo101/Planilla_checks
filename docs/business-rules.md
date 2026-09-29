# Reglas de negocio pendientes

La consulta obtiene datos del Web Service. `Obtener datos` no guarda la solicitud. La asistente puede agregar solicitudes a un borrador temporal mantenido en memoria por el navegador; `Agregar a planilla` tampoco inserta ni envia datos. Al recargar la pagina, este borrador se pierde.

Antes de agregar, Planilla Checks consulta SQL Server para comprobar que el numero de solicitud y el numero de cheque no se hayan utilizado. Al usar `Enviar planilla`, el backend repite las validaciones y persiste la planilla completa de forma transaccional. El borrador se limpia solamente cuando el servidor confirma el envio.

Reglas del flujo:

1. El numero de solicitud no puede repetirse despues de haber sido enviado en una planilla.
2. El numero de cheque debe ser unico y nunca reutilizarse.
3. Las consultas de distribucion de desembolso no estan restringidas por agencia. Un usuario autorizado puede consultar cualquier numero de solicitud valido.
4. La agencia y el usuario creador se obtienen de la sesion autenticada; nunca se aceptan IDs arbitrarios del navegador.
5. La fecha de extraccion debe utilizar la fecha y hora del sistema.
6. El monto aprobado depende de la informacion recibida del Web Service:
   - Sin cancelacion: `montoAprobado = descuentos + montoCheque`.
   - Con cancelacion: `montoAprobado = descuentos + montoCheque + montoCancelado`.
   - `descuentos` utiliza unicamente `Gasto01` de la Emision de cheque.
   - `Gasto01` de un Abono a prestamo se ignora, incluso si es distinto de cero.
   - Los campos `Gasto02-Gasto10` no participan actualmente en el calculo, sin importar la forma de desembolso.
7. La metodologia cuenta unicamente operaciones con `FormaDesembolso = 1`: una es `INDIVIDUAL` y dos o mas son `GRUPAL`.
8. Una planilla puede contener varias solicitudes.
9. Una vez enviada, la planilla debe conservarse historicamente.
10. Contabilidad puede recibir planillas de distintas agencias.
11. Los creditos procesados deben quedar bloqueados para evitar modificaciones accidentales.
12. Los totales del borrador se calculan en centavos enteros y se actualizan al agregar o eliminar solicitudes.
13. `Limpiar` elimina solamente la consulta activa y conserva las solicitudes agregadas al borrador.
14. `Enviar planilla` crea una planilla con estado `ENVIADA`; el codigo tecnico, la fecha de envio y los estados son generados por el servidor.
15. El envio admite como maximo tecnico 100 solicitudes por peticion. Este limite protege el servicio y no representa una regla funcional definitiva.
16. El backend emite un snapshot firmado de cada consulta valida. Al enviar, verifica que pertenezca al usuario, que no haya vencido y que sus importes en centavos cumplan `montoAprobado = montoCancelado + descuentos + montoCheque`.
17. La comprobacion previa de disponibilidad mejora la respuesta al usuario, pero los constraints UNIQUE de SQL Server son la defensa final ante concurrencia.

## Pendientes de confirmacion del ingeniero

1. Como representar una distribucion que contiene unicamente Abono a prestamo. Actualmente se detecta como no soportada y no se guarda.
2. Confirmacion definitiva de que `Ejecutado === true` representa el estado final requerido. Por seguridad, actualmente se rechaza cualquier otro valor.
3. Como agregar los montos de una distribucion grupal. La metodologia se identifica, pero sus montos no se calculan ni se guardan.
4. El historial real y el flujo de recepcion/procesamiento de Contabilidad. Las planillas enviadas ya quedan persistidas, pero esas interfaces siguen fuera de alcance.
