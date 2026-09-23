USE [PlanillaChecksDB];
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_usuarios_agencia' AND object_id = OBJECT_ID(N'dbo.usuarios'))
    CREATE INDEX IX_usuarios_agencia ON dbo.usuarios (agencia_id) WHERE agencia_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_planillas_fecha_agencia' AND object_id = OBJECT_ID(N'dbo.planillas'))
    CREATE INDEX IX_planillas_fecha_agencia ON dbo.planillas (fecha_creacion, agencia_id) INCLUDE (codigo, estado);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_planillas_agencia_estado' AND object_id = OBJECT_ID(N'dbo.planillas'))
    CREATE INDEX IX_planillas_agencia_estado ON dbo.planillas (agencia_id, estado) INCLUDE (fecha_creacion, fecha_envio);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_solicitudes_planilla_estado' AND object_id = OBJECT_ID(N'dbo.solicitudes_planilla'))
    CREATE INDEX IX_solicitudes_planilla_estado ON dbo.solicitudes_planilla (planilla_id, estado) INCLUDE (procesado);
GO
