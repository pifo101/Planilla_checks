const sentPlanillas = [
  { id: 'PLN-1042', agency: 'Central', date: '22/09/2026 09:35', requests: 4, approved: 42500, status: 'ENVIADA' },
  { id: 'PLN-1039', agency: 'Central', date: '21/09/2026 15:12', requests: 3, approved: 28750, status: 'RECIBIDA' },
  { id: 'PLN-1032', agency: 'Central', date: '18/09/2026 11:08', requests: 5, approved: 61900, status: 'PROCESADA' },
];

function showNewPlanilla(req, res) {
  res.render('assistant/new-planilla', {
    pageTitle: 'Nueva planilla',
  });
}

function listSentPlanillas(req, res) {
  res.render('assistant/sent-planillas', {
    pageTitle: 'Planillas enviadas',
    planillas: sentPlanillas,
    selectedDate: req.query.fecha || '',
  });
}

function showSentPlanilla(req, res) {
  const planilla = sentPlanillas.find((item) => item.id === req.params.id);

  if (!planilla) {
    return res.status(404).render('404', { pageTitle: 'Planilla no encontrada' });
  }

  return res.render('assistant/planilla-detail', {
    pageTitle: `Planilla ${planilla.id}`,
    planilla,
  });
}

module.exports = {
  showNewPlanilla,
  listSentPlanillas,
  showSentPlanilla,
};
