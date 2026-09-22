const receivedPlanillas = [
  { id: 'PLN-1042', agency: 'Central', date: '22/09/2026 09:35', requests: 4, approved: 42500, checkAmount: 39700, status: 'PENDIENTE' },
  { id: 'PLN-1040', agency: 'Norte', date: '22/09/2026 08:20', requests: 2, approved: 19800, checkAmount: 18400, status: 'EN REVISION' },
  { id: 'PLN-1038', agency: 'Sur', date: '21/09/2026 14:05', requests: 6, approved: 73400, checkAmount: 68750, status: 'PROCESADA' },
];

function listReceivedPlanillas(req, res) {
  const totalApproved = receivedPlanillas.reduce((sum, item) => sum + item.approved, 0);
  const totalChecks = receivedPlanillas.reduce((sum, item) => sum + item.checkAmount, 0);

  res.render('accounting/received-planillas', {
    pageTitle: 'Planillas recibidas',
    planillas: receivedPlanillas,
    totals: { approved: totalApproved, checks: totalChecks },
    filters: { date: req.query.fecha || '', agency: req.query.agencia || '' },
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
  });
}

module.exports = {
  listReceivedPlanillas,
  showReceivedPlanilla,
};
