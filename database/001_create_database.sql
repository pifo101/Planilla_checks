USE [master];
GO

IF DB_ID(N'PlanillaChecksDB') IS NULL
BEGIN
    CREATE DATABASE [PlanillaChecksDB];
END;
GO
