SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT numero_solicitud
        FROM dbo.solicitudes_planilla
        GROUP BY numero_solicitud
        HAVING COUNT(DISTINCT planilla_id) > 1
    )
    BEGIN
        THROW 51002, 'No se puede garantizar la integridad: una solicitud existente pertenece a varias planillas.', 1;
    END;

    IF OBJECT_ID(N'dbo.solicitudes_asignadas', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.solicitudes_asignadas (
            numero_solicitud NVARCHAR(50) NOT NULL CONSTRAINT PK_solicitudes_asignadas PRIMARY KEY,
            planilla_id BIGINT NOT NULL,
            CONSTRAINT UQ_solicitudes_asignadas_numero_planilla UNIQUE (numero_solicitud, planilla_id),
            CONSTRAINT FK_solicitudes_asignadas_planillas FOREIGN KEY (planilla_id)
                REFERENCES dbo.planillas (id) ON DELETE CASCADE
        );
    END;

    IF EXISTS (
        SELECT 1
        FROM dbo.solicitudes_planilla AS sp
        INNER JOIN dbo.solicitudes_asignadas AS sa
            ON sa.numero_solicitud = sp.numero_solicitud
        WHERE sa.planilla_id <> sp.planilla_id
    )
    BEGIN
        THROW 51003, 'No se puede garantizar la integridad: una reserva existente contradice las solicitudes persistidas.', 1;
    END;

    INSERT INTO dbo.solicitudes_asignadas (numero_solicitud, planilla_id)
    SELECT sp.numero_solicitud, MIN(sp.planilla_id)
    FROM dbo.solicitudes_planilla AS sp
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.solicitudes_asignadas AS sa
        WHERE sa.numero_solicitud = sp.numero_solicitud
    )
    GROUP BY sp.numero_solicitud;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.foreign_keys
        WHERE name = N'FK_solicitudes_asignacion'
          AND parent_object_id = OBJECT_ID(N'dbo.solicitudes_planilla')
    )
    BEGIN
        ALTER TABLE dbo.solicitudes_planilla WITH CHECK
        ADD CONSTRAINT FK_solicitudes_asignacion
            FOREIGN KEY (numero_solicitud, planilla_id)
            REFERENCES dbo.solicitudes_asignadas (numero_solicitud, planilla_id);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
