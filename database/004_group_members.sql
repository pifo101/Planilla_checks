SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.solicitudes_planilla', N'miembro_id') IS NULL
    BEGIN
        ALTER TABLE dbo.solicitudes_planilla ADD miembro_id NVARCHAR(100) NULL;
    END;

    IF EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'UQ_solicitudes_numero_solicitud'
          AND parent_object_id = OBJECT_ID(N'dbo.solicitudes_planilla')
    )
    BEGIN
        ALTER TABLE dbo.solicitudes_planilla DROP CONSTRAINT UQ_solicitudes_numero_solicitud;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'UQ_solicitudes_numero_solicitud_miembro'
          AND parent_object_id = OBJECT_ID(N'dbo.solicitudes_planilla')
    )
    BEGIN
        ALTER TABLE dbo.solicitudes_planilla
        ADD CONSTRAINT UQ_solicitudes_numero_solicitud_miembro
            UNIQUE (numero_solicitud, miembro_id);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
