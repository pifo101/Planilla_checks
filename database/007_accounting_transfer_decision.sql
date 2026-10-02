SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.planillas', N'trasladado') IS NULL
        ALTER TABLE dbo.planillas ADD trasladado BIT NULL;

    IF COL_LENGTH(N'dbo.planillas', N'fecha_decision_traslado') IS NULL
        ALTER TABLE dbo.planillas ADD fecha_decision_traslado DATETIME2(0) NULL;

    IF COL_LENGTH(N'dbo.planillas', N'decision_traslado_usuario_id') IS NULL
        ALTER TABLE dbo.planillas ADD decision_traslado_usuario_id INT NULL;

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_planillas_traslado_pendiente'
          AND object_id = OBJECT_ID(N'dbo.planillas')
          AND has_filter = 1
    )
        DROP INDEX IX_planillas_traslado_pendiente ON dbo.planillas;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_planillas_decision_traslado_usuario'
          AND parent_object_id = OBJECT_ID(N'dbo.planillas')
    )
        EXEC(N'ALTER TABLE dbo.planillas WITH CHECK
          ADD CONSTRAINT FK_planillas_decision_traslado_usuario
          FOREIGN KEY (decision_traslado_usuario_id) REFERENCES dbo.usuarios (id);');

    IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_planillas_decision_traslado'
          AND parent_object_id = OBJECT_ID(N'dbo.planillas')
    )
        EXEC(N'ALTER TABLE dbo.planillas WITH CHECK
          ADD CONSTRAINT CK_planillas_decision_traslado CHECK (
              (trasladado IS NULL AND fecha_decision_traslado IS NULL AND decision_traslado_usuario_id IS NULL)
              OR (trasladado IS NOT NULL AND fecha_decision_traslado IS NOT NULL AND decision_traslado_usuario_id IS NOT NULL)
          );');

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_planillas_traslado_pendiente'
          AND object_id = OBJECT_ID(N'dbo.planillas')
    )
        EXEC(N'CREATE INDEX IX_planillas_traslado_pendiente
          ON dbo.planillas (trasladado, agencia_id, fecha_envio DESC, id DESC)
          INCLUDE (codigo, estado, numero_acta);');

    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_planillas_historial_traslado'
          AND object_id = OBJECT_ID(N'dbo.planillas')
          AND has_filter = 1
    )
        DROP INDEX IX_planillas_historial_traslado ON dbo.planillas;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_planillas_historial_traslado'
          AND object_id = OBJECT_ID(N'dbo.planillas')
    )
        EXEC(N'CREATE INDEX IX_planillas_historial_traslado
          ON dbo.planillas (fecha_decision_traslado DESC, agencia_id, trasladado)
          INCLUDE (codigo, estado, numero_acta, decision_traslado_usuario_id);');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
