function showDashboard(req, res) {
  res.render('dashboard/index', {
    pageTitle: 'Dashboard administrativo',
    // DEMO / MOCK: replace these values with role-aware queries when backend data is available.
    metrics: [
      { label: 'Usuarios activos', value: 6, icon: 'bi-people', tone: 'primary', detail: 'de 7 usuarios' },
      { label: 'Agencias', value: 3, icon: 'bi-building', tone: 'info', detail: '3 activas' },
      { label: 'Planillas del dia', value: 4, icon: 'bi-file-earmark-check', tone: 'warning', detail: '2 pendientes' },
      { label: 'Solicitudes procesadas', value: 9, icon: 'bi-check2-circle', tone: 'success', detail: 'registro demo' },
    ],
    activities: [
      { title: 'Usuario creado', detail: 'Andrea Lopez - hoy, 08:10', icon: 'bi-person-plus' },
      { title: 'Planilla enviada', detail: 'PLN-0004 - Agencia Solola - hoy, 09:15', icon: 'bi-send-check' },
      { title: 'Planilla procesada', detail: 'PLN-0002 - Contabilidad - ayer, 16:40', icon: 'bi-check2-circle' },
      { title: 'Usuario desactivado', detail: 'Registro de demostracion - ayer, 14:20', icon: 'bi-person-dash' },
    ],
  });
}

module.exports = {
  showDashboard,
};
