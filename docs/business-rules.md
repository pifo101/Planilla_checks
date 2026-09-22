# Reglas de negocio pendientes

Estas reglas deberan aplicarse cuando se implementen la persistencia, la autenticacion y el Web Service:

1. El numero de solicitud no puede repetirse despues de haber sido enviado en una planilla.
2. El numero de cheque debe ser unico y nunca reutilizarse.
3. La agencia debe obtenerse del usuario autenticado.
4. La fecha de extraccion debe utilizar la fecha y hora del sistema.
5. El monto aprobado depende de la informacion recibida del Web Service:
   - Sin cancelacion: `montoAprobado = descuentos + montoCheque`.
   - Con cancelacion: `montoAprobado = descuentos + montoCheque + montoCancelado`.
6. La metodologia se determinara posteriormente analizando las operaciones recibidas por el GET.
7. Una planilla puede contener varias solicitudes.
8. Una vez enviada, la planilla debe conservarse historicamente.
9. Contabilidad puede recibir planillas de distintas agencias.
10. Los creditos procesados deben quedar bloqueados para evitar modificaciones accidentales.
