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
  const addButton = solicitudForm.querySelector('[data-add-to-draft]');
  const feedback = solicitudForm.querySelector('[data-request-feedback]');
  const draftBody = document.querySelector('[data-draft-body]');
  const draftCount = document.querySelector('[data-draft-count]');
  const currency = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
  let activeRequest;
  let currentRequest = null;
  let requestId = 0;
  const draftRequests = [];

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

  function toCents(value) {
    const text = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, decimals = ''] = text.split('.');
    const cents = (BigInt(whole) * 100n) + BigInt(decimals.padEnd(2, '0'));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
  }

  function formatCents(cents) {
    return currency.format(cents / 100);
  }

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function validCheckNumber(value) {
    return /^[A-Za-z0-9-]{1,50}$/.test(value);
  }

  function updateAddButton() {
    const checkNumber = solicitudForm.elements.numeroCheque.value.trim();
    addButton.disabled = !currentRequest || !currentRequest.supported || !validCheckNumber(checkNumber);
  }

  function clearCurrentRequest({ clearRequestNumber = true } = {}) {
    currentRequest = null;
    if (clearRequestNumber) solicitudForm.elements.numeroSolicitud.value = '';
    clearRequestData();
    updateAddButton();
  }

  function renderDraft() {
    draftCount.textContent = `${draftRequests.length} ${draftRequests.length === 1 ? 'registro' : 'registros'}`;

    if (draftRequests.length === 0) {
      draftBody.innerHTML = '<tr><td class="text-center text-muted py-4" colspan="10">No hay solicitudes agregadas.</td></tr>';
    } else {
      draftBody.innerHTML = draftRequests.map((item, index) => `
        <tr>
          <td>${escapeHtml(item.numeroSolicitud)}</td>
          <td>${escapeHtml(item.cliente)}</td>
          <td>${formatCents(item.montoAprobado)}</td>
          <td>${formatCents(item.montoCancelado)}</td>
          <td>${formatCents(item.descuentos)}</td>
          <td>${formatCents(item.montoCheque)}</td>
          <td>${escapeHtml(item.numeroCheque)}</td>
          <td>${escapeHtml(item.metodologia)}</td>
          <td>${new Date(item.fechaExtraccion).toLocaleString('es-GT')}</td>
          <td><button class="btn btn-sm btn-outline-danger" type="button" data-remove-draft="${index}" aria-label="Eliminar solicitud ${escapeHtml(item.numeroSolicitud)}"><i class="bi bi-trash"></i><span class="ms-1">Eliminar</span></button></td>
        </tr>
      `).join('');
    }

    const totals = draftRequests.reduce((sum, item) => ({
      approved: sum.approved + item.montoAprobado,
      cancelled: sum.cancelled + item.montoCancelado,
      discounts: sum.discounts + item.descuentos,
      check: sum.check + item.montoCheque,
    }), { approved: 0, cancelled: 0, discounts: 0, check: 0 });

    document.querySelector('[data-total-approved]').textContent = formatCents(totals.approved);
    document.querySelector('[data-total-cancelled]').textContent = formatCents(totals.cancelled);
    document.querySelector('[data-total-discounts]').textContent = formatCents(totals.discounts);
    document.querySelector('[data-total-check]').textContent = formatCents(totals.check);
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
      clearCurrentRequest({ clearRequestNumber: false });
      showFeedback('Ingresa un numero de solicitud valido, usando solo digitos.', 'warning');
      solicitudForm.elements.numeroSolicitud.focus();
      return;
    }

    activeRequest?.abort();
    activeRequest = new AbortController();
    const currentRequestId = ++requestId;
    clearCurrentRequest({ clearRequestNumber: false });
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
      currentRequest = {
        numeroSolicitud: requestNumber,
        cliente: payload.data.cliente,
        montoAprobado: payload.data.montoAprobado,
        montoCancelado: payload.data.montoCancelado,
        descuentos: payload.data.descuentos,
        montoCheque: payload.data.montoCheque,
        metodologia: payload.data.metodologia,
        fechaExtraccion: payload.data.fechaExtraccion,
        numeroCredito: payload.data.numeroCredito,
        ordenPago: payload.data.ordenPago,
        supported: payload.data.supported === true,
      };
      updateAddButton();
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

  solicitudForm.elements.numeroCheque.addEventListener('input', updateAddButton);
  solicitudForm.elements.numeroSolicitud.addEventListener('input', () => {
    if (currentRequest && solicitudForm.elements.numeroSolicitud.value.trim() !== currentRequest.numeroSolicitud) {
      clearCurrentRequest({ clearRequestNumber: false });
      showFeedback('El numero de solicitud cambio. Pulsa Obtener datos para consultar nuevamente.', 'info');
    }
  });

  addButton.addEventListener('click', async () => {
    if (!currentRequest || !currentRequest.supported) {
      showFeedback('Consulta nuevamente una solicitud soportada antes de agregarla.', 'warning');
      updateAddButton();
      return;
    }

    const numeroCheque = solicitudForm.elements.numeroCheque.value.trim();
    const requestToAdd = currentRequest;
    if (!validCheckNumber(numeroCheque)) {
      showFeedback('Ingresa un numero de cheque valido de hasta 50 caracteres alfanumericos o guiones.', 'warning');
      solicitudForm.elements.numeroCheque.focus();
      return;
    }
    if (draftRequests.some((item) => item.numeroSolicitud === requestToAdd.numeroSolicitud)) {
      showFeedback('Esta solicitud ya fue agregada al borrador.', 'warning');
      return;
    }
    if (draftRequests.some((item) => item.numeroCheque.toUpperCase() === numeroCheque.toUpperCase())) {
      showFeedback('Este numero de cheque ya fue agregado al borrador.', 'warning');
      return;
    }

    const amounts = {
      montoAprobado: toCents(requestToAdd.montoAprobado),
      montoCancelado: toCents(requestToAdd.montoCancelado),
      descuentos: toCents(requestToAdd.descuentos),
      montoCheque: toCents(requestToAdd.montoCheque),
    };
    if (Object.values(amounts).some((value) => value === null)) {
      showFeedback('La solicitud contiene datos monetarios invalidos y no puede agregarse.', 'danger');
      return;
    }
    if (amounts.montoAprobado !== amounts.montoCancelado + amounts.descuentos + amounts.montoCheque) {
      showFeedback('Los montos de la solicitud no son consistentes y no puede agregarse.', 'danger');
      return;
    }

    addButton.disabled = true;
    loadButton.disabled = true;
    try {
      const response = await fetch(`/api/solicitudes/${encodeURIComponent(requestToAdd.numeroSolicitud)}/disponibilidad?numeroCheque=${encodeURIComponent(numeroCheque)}`, {
        headers: { accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'No fue posible comprobar la disponibilidad.');
      }
      if (
        currentRequest !== requestToAdd
        || solicitudForm.elements.numeroSolicitud.value.trim() !== requestToAdd.numeroSolicitud
        || solicitudForm.elements.numeroCheque.value.trim() !== numeroCheque
      ) {
        showFeedback('La consulta o el numero de cheque cambio. Revisa los datos antes de agregar.', 'warning');
        return;
      }
      if (!payload.data.solicitudDisponible) {
        showFeedback('Esta solicitud ya fue utilizada en una planilla anterior.', 'warning');
        return;
      }
      if (!payload.data.chequeDisponible) {
        showFeedback('Este numero de cheque ya fue utilizado en una planilla anterior.', 'warning');
        return;
      }

      const draftApprovedTotal = draftRequests.reduce((total, item) => total + item.montoAprobado, 0);
      if (!Number.isSafeInteger(draftApprovedTotal + amounts.montoAprobado)) {
        showFeedback('El total del borrador excede el monto maximo permitido.', 'danger');
        return;
      }

      draftRequests.push({
        ...amounts,
        numeroSolicitud: requestToAdd.numeroSolicitud,
        cliente: requestToAdd.cliente,
        numeroCheque,
        metodologia: requestToAdd.metodologia,
        fechaExtraccion: requestToAdd.fechaExtraccion,
        numeroCredito: requestToAdd.numeroCredito,
        ordenPago: requestToAdd.ordenPago,
      });
      renderDraft();
      clearCurrentRequest();
      showFeedback('Solicitud agregada al borrador. Esto todavia no envia ni guarda la planilla.', 'success');
      solicitudForm.elements.numeroSolicitud.focus();
    } catch (error) {
      showFeedback(error.message || 'No fue posible agregar la solicitud al borrador.', 'danger');
    } finally {
      loadButton.disabled = false;
      updateAddButton();
    }
  });

  draftBody.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-draft]');
    if (!removeButton) return;
    draftRequests.splice(Number(removeButton.dataset.removeDraft), 1);
    renderDraft();
    showFeedback('Solicitud eliminada del borrador.', 'info');
  });

  solicitudForm.querySelector('[data-clear-form]').addEventListener('click', () => {
    requestId += 1;
    activeRequest?.abort();
    activeRequest = null;
    solicitudForm.reset();
    currentRequest = null;
    loadButton.disabled = false;
    loadButton.innerHTML = '<i class="bi bi-search me-2"></i>Obtener datos';
    feedback.textContent = '';
    feedback.className = 'alert d-none mt-3 mb-0';
    updateAddButton();
  });
}
