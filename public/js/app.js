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
  const loadButton = solicitudForm.querySelector('[data-fetch-distribution]');
  const feedback = solicitudForm.querySelector('[data-request-feedback]');
  const currency = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
  let activeRequest;
  let requestId = 0;

  function showFeedback(message, tone) {
    feedback.textContent = message;
    feedback.className = `alert alert-${tone} mt-3 mb-0`;
  }

  function setData(data) {
    solicitudForm.elements.cliente.value = data.cliente || '';
    solicitudForm.elements.montoAprobado.value = currency.format(data.montoAprobado);
    solicitudForm.elements.montoCancelado.value = currency.format(data.montoCancelado);
    solicitudForm.elements.descuentos.value = currency.format(data.descuentos);
    solicitudForm.elements.montoCheque.value = currency.format(data.montoCheque);
    solicitudForm.elements.fechaHora.value = new Date(data.fechaExtraccion).toLocaleString('es-GT');
    solicitudForm.elements.metodologia.value = data.metodologia || '';
    solicitudForm.elements.agencia.value = data.agencia || 'Sin agencia asignada';
  }

  function clearRequestData() {
    [
      'cliente',
      'montoAprobado',
      'montoCancelado',
      'descuentos',
      'montoCheque',
      'fechaHora',
      'metodologia',
      'agencia',
      'numeroCheque',
    ].forEach((name) => {
      solicitudForm.elements[name].value = '';
    });
  }

  loadButton.addEventListener('click', async () => {
    const requestNumber = solicitudForm.elements.numeroSolicitud.value.trim();

    if (!/^\d{1,30}$/.test(requestNumber)) {
      clearRequestData();
      showFeedback('Ingresa un numero de solicitud valido, usando solo digitos.', 'warning');
      solicitudForm.elements.numeroSolicitud.focus();
      return;
    }

    activeRequest?.abort();
    activeRequest = new AbortController();
    const currentRequestId = ++requestId;
    clearRequestData();
    loadButton.disabled = true;
    loadButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Consultando';
    showFeedback('Consultando la distribucion de desembolso...', 'info');

    try {
      const response = await fetch(`/api/solicitudes/${encodeURIComponent(requestNumber)}/distribucion`, {
        headers: { accept: 'application/json' },
        signal: activeRequest.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        if (payload?.data?.metodologia) {
          solicitudForm.elements.metodologia.value = payload.data.metodologia;
        }
        throw new Error(payload?.error?.message || 'No fue posible obtener la informacion de la solicitud.');
      }

      setData(payload.data);
      const warningMessage = payload.data.warnings?.join(' ');
      showFeedback(warningMessage || 'Datos obtenidos correctamente. Revisa la informacion antes de continuar.', warningMessage ? 'warning' : 'success');
    } catch (error) {
      if (error.name !== 'AbortError') {
        showFeedback(error.message || 'No fue posible obtener la informacion de la solicitud.', 'danger');
      }
    } finally {
      if (currentRequestId === requestId) {
        activeRequest = null;
        loadButton.disabled = false;
        loadButton.innerHTML = '<i class="bi bi-search me-2"></i>Obtener datos';
      }
    }
  });

  solicitudForm.querySelector('[data-clear-form]').addEventListener('click', () => {
    requestId += 1;
    activeRequest?.abort();
    activeRequest = null;
    solicitudForm.reset();
    loadButton.disabled = false;
    loadButton.innerHTML = '<i class="bi bi-search me-2"></i>Obtener datos';
    feedback.textContent = '';
    feedback.className = 'alert d-none mt-3 mb-0';
  });
}
