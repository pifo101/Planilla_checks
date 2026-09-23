# Reglas de negocio pendientes

Estas reglas deberan aplicarse cuando se implementen la persistencia, la autenticacion y el Web Service:

1. El numero de solicitud no puede repetirse despues de haber sido enviado en una planilla.
2. El numero de cheque debe ser unico y nunca reutilizarse.
3. La agencia debe obtenerse del usuario autenticado.
4. La fecha de extraccion debe utilizar la fecha y hora del sistema.
5. El monto aprobado depende de la informacion recibida del Web Service:
   - Sin cancelacion: `montoAprobado = descuentos + montoCheque`.
   - Con cancelacion: `montoAprobado = descuentos + montoCheque + montoCancelado`.
6. La metodologia cuenta unicamente operaciones con `FormaDesembolso = 1`: una es `INDIVIDUAL` y dos o mas son `GRUPAL`.
7. Una planilla puede contener varias solicitudes.
8. Una vez enviada, la planilla debe conservarse historicamente.
9. Contabilidad puede recibir planillas de distintas agencias.
10. Los creditos procesados deben quedar bloqueados para evitar modificaciones accidentales.

## Pendientes de confirmacion del ingeniero

1. Si descuentos utiliza solo `Gasto01` o la suma de `Gasto01` a `Gasto10`. Actualmente solo se calcula con `Gasto01` y cualquier valor en los otros campos bloquea el procesamiento.
2. Como representar una distribucion que contiene unicamente Abono a prestamo. Actualmente se detecta como no soportada y no se guarda.
3. Confirmacion definitiva de que `Ejecutado === true` representa el estado final requerido. Por seguridad, actualmente se rechaza cualquier otro valor.
4. Como agregar los montos de una distribucion grupal. La metodologia se identifica, pero sus montos no se calculan ni se guardan.
