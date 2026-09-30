SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.actas_diarias', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.actas_diarias (
            id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_actas_diarias PRIMARY KEY,
            fecha DATE NOT NULL,
            numero_acta NVARCHAR(50) NOT NULL,
            creada_por_usuario_id INT NOT NULL,
            fecha_creacion DATETIME2(0) NOT NULL CONSTRAINT DF_actas_diarias_fecha_creacion DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT UQ_actas_diarias_fecha UNIQUE (fecha),
            CONSTRAINT CK_actas_diarias_numero CHECK (LEN(LTRIM(RTRIM(numero_acta))) BETWEEN 1 AND 50),
            CONSTRAINT FK_actas_diarias_usuarios FOREIGN KEY (creada_por_usuario_id) REFERENCES dbo.usuarios (id)
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
