USE [PlanillaChecksDB];
GO

IF OBJECT_ID(N'dbo.agencias', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.agencias (
        id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_agencias PRIMARY KEY,
        codigo NVARCHAR(30) NOT NULL,
        nombre NVARCHAR(150) NOT NULL,
        activo BIT NOT NULL CONSTRAINT DF_agencias_activo DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_agencias_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_agencias_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_agencias_codigo UNIQUE (codigo)
    );
END;
GO

IF OBJECT_ID(N'dbo.usuarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.usuarios (
        id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_usuarios PRIMARY KEY,
        nombre NVARCHAR(150) NOT NULL,
        email NVARCHAR(254) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL,
        agencia_id INT NULL,
        activo BIT NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_usuarios_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_usuarios_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_usuarios_email UNIQUE (email),
        CONSTRAINT CK_usuarios_rol CHECK (rol IN ('ADMIN', 'ASISTENTE', 'CONTABILIDAD')),
        CONSTRAINT CK_usuarios_asistente_agencia CHECK (rol <> 'ASISTENTE' OR agencia_id IS NOT NULL),
        CONSTRAINT FK_usuarios_agencias FOREIGN KEY (agencia_id) REFERENCES dbo.agencias (id)
    );
END;
GO

IF OBJECT_ID(N'dbo.planillas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.planillas (
        id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_planillas PRIMARY KEY,
        codigo NVARCHAR(40) NOT NULL,
        agencia_id INT NOT NULL,
        creada_por_usuario_id INT NOT NULL,
        fecha_creacion DATETIME2(0) NOT NULL CONSTRAINT DF_planillas_fecha_creacion DEFAULT (SYSUTCDATETIME()),
        fecha_envio DATETIME2(0) NULL,
        estado VARCHAR(20) NOT NULL CONSTRAINT DF_planillas_estado DEFAULT ('BORRADOR'),
        numero_acta NVARCHAR(50) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_planillas_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_planillas_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_planillas_codigo UNIQUE (codigo),
        CONSTRAINT CK_planillas_estado CHECK (estado IN ('BORRADOR', 'ENVIADA', 'RECIBIDA', 'PROCESADA')),
        CONSTRAINT CK_planillas_fecha_envio CHECK (
            (estado = 'BORRADOR' AND fecha_envio IS NULL)
            OR (estado <> 'BORRADOR' AND fecha_envio IS NOT NULL)
        ),
        CONSTRAINT FK_planillas_agencias FOREIGN KEY (agencia_id) REFERENCES dbo.agencias (id),
        CONSTRAINT FK_planillas_usuarios FOREIGN KEY (creada_por_usuario_id) REFERENCES dbo.usuarios (id)
    );
END;
GO

IF OBJECT_ID(N'dbo.solicitudes_planilla', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.solicitudes_planilla (
        id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_solicitudes_planilla PRIMARY KEY,
        planilla_id BIGINT NOT NULL,
        numero_solicitud NVARCHAR(50) NOT NULL,
        nombre_cliente NVARCHAR(200) NOT NULL,
        monto_aprobado DECIMAL(18, 2) NOT NULL,
        monto_cancelado DECIMAL(18, 2) NOT NULL CONSTRAINT DF_solicitudes_monto_cancelado DEFAULT (0),
        descuentos DECIMAL(18, 2) NOT NULL CONSTRAINT DF_solicitudes_descuentos DEFAULT (0),
        monto_cheque DECIMAL(18, 2) NOT NULL,
        numero_cheque NVARCHAR(50) NOT NULL,
        metodologia NVARCHAR(100) NULL,
        fecha_extraccion DATETIME2(0) NOT NULL,
        estado VARCHAR(20) NOT NULL CONSTRAINT DF_solicitudes_estado DEFAULT ('PENDIENTE'),
        procesado BIT NOT NULL CONSTRAINT DF_solicitudes_procesado DEFAULT (0),
        fecha_procesado DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_solicitudes_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_solicitudes_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_solicitudes_numero_solicitud UNIQUE (numero_solicitud),
        CONSTRAINT UQ_solicitudes_numero_cheque UNIQUE (numero_cheque),
        CONSTRAINT CK_solicitudes_montos CHECK (
            monto_aprobado >= 0 AND monto_cancelado >= 0 AND descuentos >= 0 AND monto_cheque >= 0
        ),
        CONSTRAINT CK_solicitudes_monto_aprobado CHECK (
            monto_aprobado = descuentos + monto_cheque + monto_cancelado
        ),
        CONSTRAINT CK_solicitudes_estado CHECK (estado IN ('PENDIENTE', 'EN_REVISION', 'PROCESADA')),
        CONSTRAINT CK_solicitudes_procesado_fecha CHECK (
            (procesado = 0 AND fecha_procesado IS NULL)
            OR (procesado = 1 AND fecha_procesado IS NOT NULL)
        ),
        CONSTRAINT FK_solicitudes_planillas FOREIGN KEY (planilla_id) REFERENCES dbo.planillas (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_planillas_fecha_envio' AND parent_object_id = OBJECT_ID(N'dbo.planillas')
)
BEGIN
    ALTER TABLE dbo.planillas WITH CHECK ADD CONSTRAINT CK_planillas_fecha_envio CHECK (
        (estado = 'BORRADOR' AND fecha_envio IS NULL)
        OR (estado <> 'BORRADOR' AND fecha_envio IS NOT NULL)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_solicitudes_monto_aprobado'
      AND parent_object_id = OBJECT_ID(N'dbo.solicitudes_planilla')
)
BEGIN
    ALTER TABLE dbo.solicitudes_planilla WITH CHECK ADD CONSTRAINT CK_solicitudes_monto_aprobado CHECK (
        monto_aprobado = descuentos + monto_cheque + monto_cancelado
    );
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_planillas_conservar_historial
ON dbo.planillas
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM deleted WHERE estado <> 'BORRADOR')
    BEGIN
        THROW 51001, 'Una planilla enviada no puede eliminarse.', 1;
    END;

    DELETE target
    FROM dbo.planillas AS target
    INNER JOIN deleted AS source ON source.id = target.id;
END;
GO

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
