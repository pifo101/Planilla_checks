SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.usuarios', N'U') IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
       FROM sys.check_constraints
       WHERE name = N'CK_usuarios_rol_agencia'
         AND parent_object_id = OBJECT_ID(N'dbo.usuarios')
   )
BEGIN
    UPDATE dbo.usuarios
    SET agencia_id = NULL,
        updated_at = SYSUTCDATETIME()
    WHERE rol IN ('ADMIN', 'CONTABILIDAD')
      AND agencia_id IS NOT NULL;

    ALTER TABLE dbo.usuarios WITH CHECK ADD CONSTRAINT CK_usuarios_rol_agencia CHECK (
        (rol = 'ASISTENTE' AND agencia_id IS NOT NULL)
        OR (rol IN ('ADMIN', 'CONTABILIDAD') AND agencia_id IS NULL)
    );
END;
GO
