CREATE OR ALTER TRIGGER dbo.TR_solicitudes_bloquear_procesadas
ON dbo.solicitudes_planilla
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted AS d
        WHERE d.procesado = 1
    )
    BEGIN
        THROW 51000, 'Una solicitud procesada no puede modificarse ni eliminarse.', 1;
    END;

    IF EXISTS (SELECT 1 FROM inserted)
    BEGIN
        UPDATE target
        SET planilla_id = source.planilla_id,
            numero_solicitud = source.numero_solicitud,
            miembro_id = source.miembro_id,
            nombre_cliente = source.nombre_cliente,
            monto_aprobado = source.monto_aprobado,
            monto_cancelado = source.monto_cancelado,
            descuentos = source.descuentos,
            monto_cheque = source.monto_cheque,
            numero_cheque = source.numero_cheque,
            metodologia = source.metodologia,
            fecha_extraccion = source.fecha_extraccion,
            estado = source.estado,
            procesado = source.procesado,
            fecha_procesado = source.fecha_procesado,
            updated_at = SYSUTCDATETIME()
        FROM dbo.solicitudes_planilla AS target
        INNER JOIN inserted AS source ON source.id = target.id;
    END
    ELSE
    BEGIN
        DELETE target
        FROM dbo.solicitudes_planilla AS target
        INNER JOIN deleted AS source ON source.id = target.id;
    END;
END;
GO
