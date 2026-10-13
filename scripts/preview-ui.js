const path = require('path');
const express = require('express');
const { generatePlanillaPdf } = require('../src/services/planilla-pdf.service');

const HOST = '127.0.0.1';
const PORT = 3100;
const ROOT = path.join(__dirname, '..');
const FIXED_DATE = '2026-10-09';
const DAILY_ACTA = { fecha: FIXED_DATE, numeroActa: 'ACTA-DEMO-42' };
const agencyCatalog = [
  { id: 901, codigo: 'DEM-01', nombre: 'Agencia Central Demo', activo: true },
  { id: 902, codigo: 'DEM-02', nombre: 'Agencia Occidente Demo', activo: true },
  { id: 903, codigo: 'DEM-03', nombre: 'Agencia Historica Demo', activo: false },
];

const demoUsers = [
  { id: 9001, nombre: 'Administracion Demo', email: 'admin@example.invalid', rol: 'ADMIN', agenciaId: null, agenciaNombre: null, activo: true, createdAt: new Date('2026-09-01T08:00:00-06:00') },
  { id: 9002, nombre: 'Asistente Demo', email: 'asistente@example.invalid', rol: 'ASISTENTE', agenciaId: 901, agenciaNombre: 'Agencia Central Demo', activo: true, createdAt: new Date('2026-09-02T08:00:00-06:00') },
  { id: 9003, nombre: 'Contabilidad Demo', email: 'contabilidad@example.invalid', rol: 'CONTABILIDAD', agenciaId: null, agenciaNombre: null, activo: true, createdAt: new Date('2026-09-03T08:00:00-06:00') },
  { id: 9004, nombre: 'Asistente Occidente Demo', email: 'occidente@example.invalid', rol: 'ASISTENTE', agenciaId: 902, agenciaNombre: 'Agencia Occidente Demo', activo: false, createdAt: new Date('2026-09-04T08:00:00-06:00') },
];

const agencies = agencyCatalog.map((agency) => ({
  ...agency,
  usuarios: demoUsers.filter((user) => user.agenciaId === agency.id).length,
}));

const usersByRole = {
  ADMIN: demoUsers.find((user) => user.rol === 'ADMIN'),
  ASISTENTE: demoUsers.find((user) => user.rol === 'ASISTENTE' && user.activo),
  CONTABILIDAD: demoUsers.find((user) => user.rol === 'CONTABILIDAD'),
};

function request(values) {
  return {
    miembroId: null,
    metodologia: 'INDIVIDUAL',
    estado: 'PENDIENTE',
    procesado: false,
    fechaProcesado: null,
    fechaExtraccion: new Date(`${values.fechaOperativa}T08:10:00-06:00`),
    ...values,
  };
}

function toCents(value) {
  const [whole, decimals = ''] = String(value).split('.');
  return (Number(whole) * 100) + Number(decimals.padEnd(2, '0'));
}

function fromCents(value) {
  return (value / 100).toFixed(2);
}

function totalRequests(solicitudes, field) {
  return solicitudes.reduce((total, item) => total + toCents(item[field]), 0);
}

function makePlanilla(values) {
  const agency = agencies.find((item) => item.id === values.agenciaId);
  const creator = demoUsers.find((item) => item.id === values.creadaPorId);
  const solicitudes = values.solicitudes.map((item) => ({ ...item }));
  return {
    ...values,
    agenciaNombre: agency.nombre,
    creadaPor: creator.nombre,
    cantidadRegistros: solicitudes.length,
    totalAprobado: fromCents(totalRequests(solicitudes, 'montoAprobado')),
    totalCancelado: fromCents(totalRequests(solicitudes, 'montoCancelado')),
    totalDescuentos: fromCents(totalRequests(solicitudes, 'descuentos')),
    totalMontoCheque: fromCents(totalRequests(solicitudes, 'montoCheque')),
    estado: 'ENVIADA',
    solicitudes,
  };
}

const allPlanillas = [
  makePlanilla({
    id: 9901, codigo: 'PLA-DEMO-001', numeroActa: DAILY_ACTA.numeroActa, fechaOperativa: FIXED_DATE,
    fechaCreacion: new Date('2026-10-09T08:30:00-06:00'), fechaEnvio: new Date('2026-10-09T09:15:00-06:00'),
    agenciaId: 901, creadaPorId: 9002, trasladado: null, fechaDecisionTraslado: null,
    fechaDecisionOperativa: null, decisionTrasladoUsuario: null,
    solicitudes: [
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10001', nombreCliente: 'Cliente Ficticio Uno', montoAprobado: '12500.00', montoCancelado: '1500.00', descuentos: '350.00', montoCheque: '10650.00', numeroCheque: 'DEM-000101' }),
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10002', miembroId: 'M-DEMO-02', nombreCliente: 'Cliente Ficticio Dos', montoAprobado: '8900.00', montoCancelado: '900.00', descuentos: '200.00', montoCheque: '7800.00', numeroCheque: 'DEM-000102', metodologia: 'GRUPAL' }),
    ],
  }),
  makePlanilla({
    id: 9902, codigo: 'PLA-DEMO-002', numeroActa: DAILY_ACTA.numeroActa, fechaOperativa: FIXED_DATE,
    fechaCreacion: new Date('2026-10-09T09:30:00-06:00'), fechaEnvio: new Date('2026-10-09T10:05:00-06:00'),
    agenciaId: 902, creadaPorId: 9004, trasladado: null, fechaDecisionTraslado: null,
    fechaDecisionOperativa: null, decisionTrasladoUsuario: null,
    solicitudes: [
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10003', nombreCliente: 'Cliente Ficticio Tres', montoAprobado: '7300.00', montoCancelado: '500.00', descuentos: '100.00', montoCheque: '6700.00', numeroCheque: 'DEM-000103' }),
    ],
  }),
  makePlanilla({
    id: 9903, codigo: 'PLA-DEMO-003', numeroActa: DAILY_ACTA.numeroActa, fechaOperativa: FIXED_DATE,
    fechaCreacion: new Date('2026-10-09T07:45:00-06:00'), fechaEnvio: new Date('2026-10-09T08:20:00-06:00'),
    agenciaId: 901, creadaPorId: 9002, trasladado: true,
    fechaDecisionTraslado: new Date('2026-10-09T14:10:00-06:00'), fechaDecisionOperativa: FIXED_DATE,
    decisionTrasladoUsuario: 'Contabilidad Demo',
    solicitudes: [
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10004', nombreCliente: 'Cliente Ficticio Cuatro', montoAprobado: '10000.00', montoCancelado: '1000.00', descuentos: '250.00', montoCheque: '8750.00', numeroCheque: 'DEM-000104', estado: 'PROCESADA', procesado: true, fechaProcesado: new Date('2026-10-09T13:20:00-06:00') }),
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10005', nombreCliente: 'Cliente Ficticio Cinco', montoAprobado: '5000.00', montoCancelado: '500.00', descuentos: '100.00', montoCheque: '4400.00', numeroCheque: 'DEM-000105', estado: 'PROCESADA', procesado: true, fechaProcesado: new Date('2026-10-09T13:30:00-06:00') }),
    ],
  }),
  makePlanilla({
    id: 9904, codigo: 'PLA-DEMO-004', numeroActa: 'ACTA-DEMO-41', fechaOperativa: '2026-10-08',
    fechaCreacion: new Date('2026-10-08T10:10:00-06:00'), fechaEnvio: new Date('2026-10-08T10:40:00-06:00'),
    agenciaId: 902, creadaPorId: 9004, trasladado: false,
    fechaDecisionTraslado: new Date('2026-10-09T15:25:00-06:00'), fechaDecisionOperativa: FIXED_DATE,
    decisionTrasladoUsuario: 'Contabilidad Demo',
    solicitudes: [
      request({ fechaOperativa: '2026-10-08', numeroSolicitud: '10006', nombreCliente: 'Cliente Ficticio Seis', montoAprobado: '9200.00', montoCancelado: '1200.00', descuentos: '300.00', montoCheque: '7700.00', numeroCheque: 'DEM-000106' }),
    ],
  }),
  makePlanilla({
    id: 9905, codigo: 'PLA-DEMO-GRUPAL-005', numeroActa: DAILY_ACTA.numeroActa, fechaOperativa: FIXED_DATE,
    fechaCreacion: new Date('2026-10-09T10:25:00-06:00'), fechaEnvio: new Date('2026-10-09T11:00:00-06:00'),
    agenciaId: 901, creadaPorId: 9002, trasladado: true,
    fechaDecisionTraslado: new Date('2026-10-09T15:05:00-06:00'), fechaDecisionOperativa: FIXED_DATE,
    decisionTrasladoUsuario: 'Contabilidad Demo',
    solicitudes: [
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10007', miembroId: 'GRP-01-A', nombreCliente: 'Maria Jose Perez', montoAprobado: '4500.00', montoCancelado: '500.00', descuentos: '100.00', montoCheque: '3900.00', numeroCheque: 'DEM-000107', metodologia: 'GRUPAL' }),
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10008', miembroId: 'GRP-01-B', nombreCliente: 'Jose Angel Lopez', montoAprobado: '5200.00', montoCancelado: '700.00', descuentos: '150.00', montoCheque: '4350.00', numeroCheque: 'DEM-000108', metodologia: 'GRUPAL' }),
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10009', miembroId: 'GRP-01-C', nombreCliente: 'Ana Lucia Garcia', montoAprobado: '3800.00', montoCancelado: '300.00', descuentos: '100.00', montoCheque: '3400.00', numeroCheque: 'DEM-000109', metodologia: 'GRUPAL' }),
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10010', miembroId: 'GRP-01-D', nombreCliente: 'Sofia Hernandez Diaz', montoAprobado: '6100.00', montoCancelado: '900.00', descuentos: '200.00', montoCheque: '5000.00', numeroCheque: 'DEM-000110', metodologia: 'GRUPAL' }),
      request({ fechaOperativa: FIXED_DATE, numeroSolicitud: '10011', miembroId: 'GRP-01-E', nombreCliente: 'Oscar Rene Chacon', montoAprobado: '4900.00', montoCancelado: '400.00', descuentos: '125.00', montoCheque: '4375.00', numeroCheque: 'DEM-000111', metodologia: 'GRUPAL' }),
    ],
  }),
];

const pendingPlanillas = allPlanillas.filter((planilla) => planilla.trasladado === null);
const historyPlanillas = allPlanillas.filter((planilla) => planilla.trasladado !== null);

function summarizePlanillas(planillas) {
  return {
    cantidadPlanillas: planillas.length,
    cantidadRegistros: planillas.reduce((total, item) => total + item.cantidadRegistros, 0),
    totalAprobado: fromCents(planillas.reduce((total, item) => total + toCents(item.totalAprobado), 0)),
    totalCancelado: fromCents(planillas.reduce((total, item) => total + toCents(item.totalCancelado), 0)),
    totalDescuentos: fromCents(planillas.reduce((total, item) => total + toCents(item.totalDescuentos), 0)),
    totalMontoCheque: fromCents(planillas.reduce((total, item) => total + toCents(item.totalMontoCheque), 0)),
  };
}

function userForPath(requestPath) {
  if (requestPath.startsWith('/asistente')) return usersByRole.ASISTENTE;
  if (requestPath.startsWith('/contabilidad')) return usersByRole.CONTABILIDAD;
  if (requestPath.startsWith('/admin') || requestPath === '/dashboard') return usersByRole.ADMIN;
  return null;
}

function formatSqlCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `Q\u00a0${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Q\u00a00.00';
}

function safePdfFilename(code) {
  const safeCode = String(code || 'sin-codigo').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  return `planilla-${safeCode || 'sin-codigo'}.pdf`;
}

async function sendPlanillaPdf(res, planilla) {
  const pdf = await generatePlanillaPdf(planilla);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safePdfFilename(planilla.codigo)}"`,
    'Content-Length': String(pdf.length),
    'Cache-Control': 'no-store, private, max-age=0',
    Pragma: 'no-cache',
  });
  return res.send(pdf);
}

function createPreviewApp() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La vista previa de UI no puede ejecutarse en produccion.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'src', 'views'));

  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; connect-src 'none'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });

  app.use('/preview-assets/bootstrap', express.static(path.join(ROOT, 'node_modules', 'bootstrap', 'dist')));
  app.use('/preview-assets/bootstrap-icons', express.static(path.join(ROOT, 'node_modules', 'bootstrap-icons', 'font')));
  app.use('/preview-assets/inter', express.static(path.join(ROOT, 'node_modules', '@fontsource', 'inter', 'files')));
  app.use(express.static(path.join(ROOT, 'public')));

  app.use((req, res, next) => {
    const currentUser = userForPath(req.path);
    res.locals.previewMode = true;
    res.locals.currentPath = req.path;
    res.locals.currentUser = currentUser;
    res.locals.homePath = currentUser?.rol === 'ADMIN'
      ? '/dashboard'
      : currentUser?.rol === 'ASISTENTE' ? '/asistente/nueva-planilla' : '/contabilidad/planillas';
    res.locals.institutionalPortalUrl = null;
    res.locals.csrfToken = 'preview-disabled';
    res.locals.dateTime = new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala',
    });
    res.locals.sqlCurrency = { format: formatSqlCurrency };
    next();
  });

  app.get('/', (req, res) => res.redirect('/login'));
  app.get('/preview/admin', (req, res) => res.redirect('/dashboard'));
  app.get('/preview/asistente', (req, res) => res.redirect('/asistente/nueva-planilla'));
  app.get('/preview/contabilidad', (req, res) => res.redirect('/contabilidad/planillas'));

  app.get('/login', (req, res) => res.render('auth/login', {
    pageTitle: 'Login - Demostracion',
    message: 'Vista previa: el acceso real esta deshabilitado.',
    email: '',
  }));

  app.get('/crear-cuenta', (req, res) => res.render('auth/register', {
    pageTitle: 'Registro - Demostracion',
    agencies: agencies.filter((agency) => agency.activo),
    values: {},
  }));

  app.get('/dashboard', (req, res) => res.render('dashboard/index', {
    pageTitle: 'Dashboard ADMIN - Demostracion',
    summary: {
      users: {
        totalUsuarios: demoUsers.length,
        usuariosActivos: demoUsers.filter((user) => user.activo).length,
        usuariosBloqueados: demoUsers.filter((user) => !user.activo).length,
        asistentesConAgencia: demoUsers.filter((user) => user.rol === 'ASISTENTE' && user.agenciaId).length,
        asistentes: demoUsers.filter((user) => user.rol === 'ASISTENTE').length,
        administradores: demoUsers.filter((user) => user.rol === 'ADMIN').length,
        contabilidad: demoUsers.filter((user) => user.rol === 'CONTABILIDAD').length,
      },
      agencies: {
        totalAgencias: agencies.length,
        agenciasActivas: agencies.filter((agency) => agency.activo).length,
        agenciasInactivas: agencies.filter((agency) => !agency.activo).length,
      },
      assistantsByAgency: agencies.map((agency) => ({
        ...agency,
        asistentes: demoUsers.filter((user) => user.rol === 'ASISTENTE' && user.agenciaId === agency.id).length,
      })),
    },
  }));

  app.get('/asistente/nueva-planilla', (req, res) => res.render('assistant/new-planilla', {
    pageTitle: 'Dashboard ASISTENTE - Demostracion',
    dailyActa: { fecha: DAILY_ACTA.fecha, acta: { numeroActa: DAILY_ACTA.numeroActa } },
    previewRequest: allPlanillas[0].solicitudes[0],
  }));

  app.get('/asistente/planillas', (req, res) => {
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : FIXED_DATE;
    const planillas = allPlanillas.filter((planilla) => (
      planilla.agenciaId === usersByRole.ASISTENTE.agenciaId && planilla.fechaOperativa === selectedDate
    ));
    return res.render('assistant/sent-planillas', {
      pageTitle: 'Planillas enviadas - Demostracion', selectedDate, planillas,
      total: planillas.length, page: 1, totalPages: 1,
      returnTo: `/asistente/planillas?fecha=${selectedDate}&page=1`,
    });
  });

  app.get('/asistente/planillas/:id/pdf', async (req, res) => {
    const planilla = allPlanillas.find((item) => (
      String(item.id) === req.params.id
      && item.agenciaId === usersByRole.ASISTENTE.agenciaId
      && item.estado === 'ENVIADA'
      && item.fechaEnvio
    ));
    if (!planilla) return res.status(404).render('404', { pageTitle: 'Planilla no encontrada', errorMessage: 'La planilla no existe o no pertenece a la agencia demostrativa.', errorCode: 404 });
    return sendPlanillaPdf(res, planilla);
  });

  app.get('/asistente/planillas/:id', (req, res) => {
    const planilla = allPlanillas.find((item) => (
      String(item.id) === req.params.id && item.agenciaId === usersByRole.ASISTENTE.agenciaId
    ));
    if (!planilla) return res.status(404).render('404', { pageTitle: 'Planilla no encontrada', errorMessage: 'La planilla no existe o no pertenece a la agencia demostrativa.', errorCode: 404 });
    return res.render('assistant/planilla-detail', {
      pageTitle: 'Detalle de planilla - Demostracion', planilla, returnTo: '/asistente/planillas',
    });
  });

  app.get('/contabilidad/planillas', (req, res) => {
    const requestedAgency = Number(req.query.agencia);
    const selectedAgencyId = agencies.some((agency) => agency.id === requestedAgency) ? requestedAgency : null;
    const planillas = pendingPlanillas.filter((planilla) => !selectedAgencyId || planilla.agenciaId === selectedAgencyId);
    return res.render('accounting/received-planillas', {
      pageTitle: 'Dashboard CONTABILIDAD - Demostracion', message: null, agencies,
      selectedAgencyId, planillas, summary: summarizePlanillas(planillas),
      total: planillas.length, page: 1, totalPages: 1,
      returnTo: selectedAgencyId ? `/contabilidad/planillas?agencia=${selectedAgencyId}&page=1` : '/contabilidad/planillas?page=1',
      decisionReturnTo: selectedAgencyId ? `/contabilidad/planillas?agencia=${selectedAgencyId}` : '/contabilidad/planillas',
    });
  });

  app.get('/contabilidad/planillas/:id/pdf', async (req, res) => {
    const planilla = allPlanillas.find((item) => (
      String(item.id) === req.params.id && item.estado === 'ENVIADA' && item.fechaEnvio
    ));
    if (!planilla) return res.status(404).render('404', { pageTitle: 'Planilla no encontrada', errorMessage: 'La planilla demostrativa solicitada no existe.', errorCode: 404 });
    return sendPlanillaPdf(res, planilla);
  });

  app.get('/contabilidad/planillas/:id', (req, res) => {
    const planilla = allPlanillas.find((item) => String(item.id) === req.params.id);
    if (!planilla) return res.status(404).render('404', { pageTitle: 'Planilla no encontrada', errorMessage: 'La planilla demostrativa solicitada no existe.', errorCode: 404 });
    return res.render('accounting/planilla-detail', {
      pageTitle: 'Detalle contable - Demostracion',
      planilla,
      returnTo: req.query.returnTo?.startsWith('/contabilidad/historial') ? '/contabilidad/historial' : '/contabilidad/planillas',
    });
  });

  app.get('/contabilidad/historial', (req, res) => {
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fecha || '')) ? req.query.fecha : FIXED_DATE;
    const requestedAgency = Number(req.query.agencia);
    const selectedAgencyId = agencies.some((agency) => agency.id === requestedAgency) ? requestedAgency : null;
    const selectedResult = ['trasladadas', 'no-trasladadas'].includes(req.query.resultado) ? req.query.resultado : 'todas';
    const planillas = historyPlanillas.filter((planilla) => (
      planilla.fechaDecisionOperativa === selectedDate
      && (!selectedAgencyId || planilla.agenciaId === selectedAgencyId)
      && (selectedResult === 'todas' || planilla.trasladado === (selectedResult === 'trasladadas'))
    ));
    const baseSummary = summarizePlanillas(planillas);
    const summary = {
      ...baseSummary,
      cantidadTrasladadas: planillas.filter((planilla) => planilla.trasladado).length,
      cantidadNoTrasladadas: planillas.filter((planilla) => !planilla.trasladado).length,
    };
    const query = new URLSearchParams({ fecha: selectedDate, resultado: selectedResult, page: '1' });
    if (selectedAgencyId) query.set('agencia', String(selectedAgencyId));
    return res.render('accounting/transfer-history', {
      pageTitle: 'Historial - Demostracion', selectedDate, agencies, selectedAgencyId,
      selectedResult, planillas, summary, total: planillas.length, page: 1, totalPages: 1,
      returnTo: `/contabilidad/historial?${query}`,
    });
  });

  app.get('/admin/usuarios', (req, res) => res.render('admin/users', {
    pageTitle: 'Gestion de usuarios - Demostracion',
    message: null,
    summary: {
      total: demoUsers.length,
      active: demoUsers.filter((user) => user.activo).length,
      blocked: demoUsers.filter((user) => !user.activo).length,
      assistants: demoUsers.filter((user) => user.rol === 'ASISTENTE').length,
    },
    users: demoUsers,
    roles: ['ADMIN', 'ASISTENTE', 'CONTABILIDAD'],
    roleLabels: { ADMIN: 'Administrador', ASISTENTE: 'Asistente', CONTABILIDAD: 'Contabilidad' },
    agencies: agencies.filter((agency) => agency.activo),
    agencyFilters: agencies.map((agency) => agency.nombre),
  }));

  app.get('/admin/usuarios/nuevo', (req, res) => res.render('admin/new-user', {
    pageTitle: 'Crear usuario - Demostracion',
    values: {},
    roles: ['ADMIN', 'ASISTENTE', 'CONTABILIDAD'],
    roleLabels: { ADMIN: 'Administrador', ASISTENTE: 'Asistente', CONTABILIDAD: 'Contabilidad' },
    agencies: agencies.filter((agency) => agency.activo),
  }));

  app.get('/admin/agencias', (req, res) => res.render('admin/agencies', {
    pageTitle: 'Agencias - Demostracion',
    agencies,
    summary: {
      total: agencies.length,
      active: agencies.filter((agency) => agency.activo).length,
      associatedUsers: agencies.reduce((total, agency) => total + agency.usuarios, 0),
    },
  }));

  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    return res.status(405).json({
      success: false,
      error: { code: 'PREVIEW_READ_ONLY', message: 'Operacion deshabilitada en la vista previa sin persistencia.' },
    });
  });

  app.use((req, res) => res.status(404).render('404', {
    pageTitle: 'Vista no disponible',
    errorMessage: 'Esta ruta no forma parte de la demostracion local.',
    errorCode: 404,
  }));

  return app;
}

function startPreviewServer() {
  const app = createPreviewApp();
  return app.listen(PORT, HOST, () => {
    console.log(`Vista previa local disponible en http://${HOST}:${PORT}`);
    console.log('Modo demostracion: datos ficticios, sin SQL Server, Web Service ni persistencia.');
  });
}

if (require.main === module) startPreviewServer();

module.exports = {
  HOST,
  PORT,
  createPreviewApp,
  startPreviewServer,
  demoData: { DAILY_ACTA, agencies, demoUsers, allPlanillas, pendingPlanillas, historyPlanillas },
  summarizePlanillas,
};
