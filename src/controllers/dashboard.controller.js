function showDashboard(req, res) {
  res.render('dashboard/index', {
    pageTitle: 'Dashboard',
    metrics: [
      { label: 'Planillas enviadas hoy', value: 8, icon: 'bi-send-check', tone: 'primary' },
      { label: 'Planillas recibidas', value: 21, icon: 'bi-inbox', tone: 'success' },
      { label: 'Solicitudes procesadas', value: 146, icon: 'bi-check2-circle', tone: 'info' },
      { label: 'Pendientes', value: 12, icon: 'bi-hourglass-split', tone: 'warning' },
    ],
    activities: [
      { title: 'Planilla PLN-1042 enviada', detail: 'Agencia Central - hace 12 minutos' },
      { title: 'Planilla PLN-1041 recibida', detail: 'Agencia Norte - hace 35 minutos' },
      { title: '3 solicitudes procesadas', detail: 'Contabilidad - hace 1 hora' },
    ],
  });
}

module.exports = {
  showDashboard,
};
