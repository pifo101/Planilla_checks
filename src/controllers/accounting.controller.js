// DEMO / MOCK: replace this collection with SQL-backed planillas when the backend is ready.
const receivedPlanillas = [
  {
    id: 'PLN-0004', agency: 'Solola', date: '28/09/2026 09:15', filterDate: '2026-09-28', sentBy: 'Juan Perez',
    approved: 25000, canceled: 1200, discounts: 1800, checkAmount: 22000, status: 'PENDIENTE',
    items: [
      { request: 'SOL-2401', client: 'Cliente demostracion A', approved: 12000, canceled: 1200, discounts: 800, checkAmount: 10000, checkNumber: 'CHK-9001', methodology: 'Cuota nivelada', status: 'PENDIENTE' },
      { request: 'SOL-2402', client: 'Cliente demostracion B', approved: 13000, canceled: 0, discounts: 1000, checkAmount: 12000, checkNumber: 'CHK-9002', methodology: 'Cuota nivelada', status: 'PENDIENTE' },
    ],
  },
  {
    id: 'PLN-0003', agency: 'Panajachel', date: '28/09/2026 08:40', filterDate: '2026-09-28', sentBy: 'Andrea Lopez',
    approved: 19800, canceled: 0, discounts: 1400, checkAmount: 18400, status: 'PENDIENTE',
    items: [
      { request: 'PAN-1830', client: 'Cliente demostracion C', approved: 11000, canceled: 0, discounts: 700, checkAmount: 10300, checkNumber: 'CHK-8998', methodology: 'Cuota nivelada', status: 'PENDIENTE' },
      { request: 'PAN-1831', client: 'Cliente demostracion D', approved: 8800, canceled: 0, discounts: 700, checkAmount: 8100, checkNumber: 'CHK-8999', methodology: 'Cuota nivelada', status: 'PENDIENTE' },
    ],
  },
  {
    id: 'PLN-0002', agency: 'Santiago Atitlan', date: '27/09/2026 14:05', filterDate: '2026-09-27', sentBy: 'Pedro Mendez',
    approved: 16400, canceled: 500, discounts: 1150, checkAmount: 14750, status: 'PROCESADO',
    items: [
      { request: 'SAT-0914', client: 'Cliente demostracion E', approved: 16400, canceled: 500, discounts: 1150, checkAmount: 14750, checkNumber: 'CHK-8992', methodology: 'Cuota nivelada', status: 'PROCESADO' },
    ],
  },
  {
    id: 'PLN-0001', agency: 'Solola', date: '26/09/2026 11:25', filterDate: '2026-09-26', sentBy: 'Juan Perez',
    approved: 9600, canceled: 0, discounts: 600, checkAmount: 9000, status: 'PROCESADO',
    items: [
      { request: 'SOL-2389', client: 'Cliente demostracion F', approved: 9600, canceled: 0, discounts: 600, checkAmount: 9000, checkNumber: 'CHK-8985', methodology: 'Cuota nivelada', status: 'PROCESADO' },
    ],
  },
];

function listReceivedPlanillas(req, res) {
  const totals = receivedPlanillas.reduce((result, planilla) => ({
    approved: result.approved + planilla.approved,
    canceled: result.canceled + planilla.canceled,
    discounts: result.discounts + planilla.discounts,
    checks: result.checks + planilla.checkAmount,
    requests: result.requests + planilla.items.length,
    pending: result.pending + (planilla.status === 'PENDIENTE' ? 1 : 0),
    processed: result.processed + (planilla.status === 'PROCESADO' ? 1 : 0),
  }), { approved: 0, canceled: 0, discounts: 0, checks: 0, requests: 0, pending: 0, processed: 0 });

  res.render('accounting/received-planillas', {
    pageTitle: 'Planillas recibidas',
    planillas: receivedPlanillas,
    agencies: [...new Set(receivedPlanillas.map((planilla) => planilla.agency))],
    totals,
    filters: { date: req.query.fecha || '2026-09-28', agency: req.query.agencia || '', status: req.query.estado || '', search: req.query.buscar || '' },
  });
}

function showReceivedPlanilla(req, res) {
  const planilla = receivedPlanillas.find((item) => item.id === req.params.id);

  if (!planilla) {
    return res.status(404).render('404', { pageTitle: 'Planilla no encontrada' });
  }

  return res.render('accounting/planilla-detail', {
    pageTitle: `Planilla ${planilla.id}`,
    planilla,
    totals: {
      approved: planilla.approved,
      canceled: planilla.canceled,
      discounts: planilla.discounts,
      checks: planilla.checkAmount,
    },
  });
}

module.exports = {
  listReceivedPlanillas,
  showReceivedPlanilla,
};
