# Reglas de negocio

La consulta obtiene datos del Web Service. `Obtener datos` no guarda la solicitud. La asistente puede agregar solicitudes a un borrador temporal mantenido en memoria por el navegador; `Agregar a planilla` tampoco inserta ni envia datos. Al recargar la pagina, este borrador se pierde.

Antes de agregar, Planilla Checks consulta SQL Server para comprobar que el numero de solicitud y el numero de cheque no se hayan utilizado. Al usar `Enviar planilla`, el backend repite las validaciones y persiste la planilla completa de forma transaccional. El borrador se limpia solamente cuando el servidor confirma el envio.

Reglas del flujo:

1. Una solicitud individual no puede repetirse despues de haber sido enviada. En una solicitud grupal, cada `ID` tecnico de emision puede persistirse una sola vez para el mismo numero de solicitud. Este ID no identifica funcionalmente a la persona ni relaciona abonos con emisiones.
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
8. Todo registro recibido debe tener `Ejecutado === true`. Un valor `false`, ausente o de otro tipo bloquea la solicitud completa; no se omite silenciosamente el registro.
9. Una distribucion que contiene abonos pero ninguna emision de cheque no procede y no puede agregarse a una planilla.
10. Una planilla puede contener varias solicitudes.
11. Una vez enviada, la planilla debe conservarse historicamente.
12. Contabilidad puede recibir planillas de distintas agencias.
13. Los creditos procesados deben quedar bloqueados para evitar modificaciones accidentales.
14. Los totales del borrador se calculan en centavos enteros y se actualizan al agregar o eliminar solicitudes.
15. `Limpiar` elimina solamente la consulta activa y conserva las solicitudes agregadas al borrador.
16. `Enviar planilla` crea una planilla con estado `ENVIADA`; el codigo tecnico, la fecha de envio y los estados son generados por el servidor.
17. El envio admite como maximo tecnico 100 solicitudes por peticion. Este limite protege el servicio y no representa una regla funcional definitiva.
18. El backend emite un snapshot firmado de cada consulta valida. Al enviar, verifica que pertenezca al usuario, que no haya vencido y que sus importes en centavos cumplan `montoAprobado = montoCancelado + descuentos + montoCheque`.
19. La comprobacion previa de disponibilidad mejora la respuesta al usuario, pero los constraints UNIQUE de SQL Server son la defensa final ante concurrencia.
20. Cada emision de cheque de una solicitud grupal representa un miembro y genera un cuadro y una fila independientes.
21. `NombreEnCheque` relaciona un abono con una emision. Para comparar se recortan extremos, se colapsan espacios consecutivos y se ignoran diferencias de mayusculas/minusculas. No se quitan acentos o partes del nombre y no se usa fuzzy matching.
22. Un miembro grupal puede tener solo una emision, o una emision y un abono del mismo nombre normalizado. Un abono sin emision correspondiente no es valido.
23. Dos emisiones con el mismo nombre normalizado o dos abonos para el mismo nombre son ambiguos y bloquean la solicitud completa; no se adivina ni se suman abonos.
24. Todos los miembros de un grupo calculado se agregan y envian juntos. Cada uno requiere un numero de cheque distinto.
25. El historial del asistente es de solo lectura y muestra exclusivamente planillas de su agencia revalidada. El filtro diario utiliza `fecha_envio`; cada miembro grupal se cuenta y se muestra como un registro independiente.
26. Existe una sola acta global por fecha operativa de `America/Guatemala`; no pertenece a usuario ni agencia.
27. El primer `ASISTENTE` activo del dia introduce manualmente el numero. El servidor fija fecha y creador; los demas asistentes y agencias reutilizan el mismo valor.
28. El acta es inmutable durante el dia en el flujo ordinario. No se genera automaticamente, no se edita y no se elimina.
29. Sin acta vigente se puede consultar historial y preparar el borrador, pero `Enviar planilla` se rechaza. Al cambiar de fecha no se hereda el acta anterior.
30. En cada envio el servidor consulta nuevamente SQL y guarda `planillas.numero_acta` como snapshot. El navegador no controla el acta, fecha, creador ni agencia.
31. `UNIQUE(actas_diarias.fecha)` decide las carreras concurrentes. El segundo intento no reemplaza al primero y recibe el acta vigente.

## Pendientes de confirmacion del ingeniero

1. El flujo real de recepcion/procesamiento de Contabilidad. Las planillas enviadas y el historial del asistente ya usan SQL Server, pero Contabilidad permanece fuera de alcance.
2. La autoridad y el procedimiento excepcional para corregir un acta introducida incorrectamente. No existe correccion ordinaria en esta feature.
