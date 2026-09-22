const sidebarToggle = document.querySelector('[data-sidebar-toggle]');

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
}

document.addEventListener('click', (event) => {
  if (
    document.body.classList.contains('sidebar-open')
    && !event.target.closest('.app-sidebar')
    && !event.target.closest('[data-sidebar-toggle]')
  ) {
    document.body.classList.remove('sidebar-open');
  }
});

const solicitudForm = document.querySelector('[data-solicitud-form]');

if (solicitudForm) {
  const demoData = {
    cliente: 'Cliente de demostracion',
    montoAprobado: 'Q 12,500.00',
    montoCancelado: 'Q 1,000.00',
    descuentos: 'Q 750.00',
    montoCheque: 'Q 10,750.00',
    fechaHora: '22/09/2026 10:30',
    metodologia: 'Demostracion',
    agencia: 'Agencia demo',
  };

  solicitudForm.querySelector('[data-load-demo]').addEventListener('click', () => {
    Object.entries(demoData).forEach(([name, value]) => {
      solicitudForm.elements[name].value = value;
    });
  });

  solicitudForm.querySelector('[data-clear-form]').addEventListener('click', () => {
    solicitudForm.reset();
  });
}
