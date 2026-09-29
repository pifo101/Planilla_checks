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
  const maxDraftRequests = 100;
  const loadButton = solicitudForm.querySelector('[data-fetch-distribution]');
  const addButton = solicitudForm.querySelector('[data-add-to-draft]');
  const addGroupButton = solicitudForm.querySelector('[data-add-group-to-draft]');
  const checkNumberInput = solicitudForm.elements.numeroCheque;
  const individualSection = solicitudForm.querySelector('[data-individual-request]');
  const groupedSection = solicitudForm.querySelector('[data-grouped-request]');
  const groupedMembers = solicitudForm.querySelector('[data-group-members]');
  const feedback = solicitudForm.querySelector('[data-request-feedback]');
  const draftBody = document.querySelector('[data-draft-body]');
  const draftCount = document.querySelector('[data-draft-count]');
  const sendButton = document.querySelector('[data-send-planilla]');
  const currency = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
  let currentRequest = null;
  let checkingAvailability = false;
  let sendingPlanilla = false;
  const distributionRequests = createRequestGuard();
  const availabilityRequests = createRequestGuard();
  const planillaSubmitter = createPlanillaSubmitter(fetch);
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
    return value !== '' && /^(?:[A-Za-z0-9]|-){1,50}$/.test(value);
  }

  function currentCheckInputs() {
    return currentRequest?.metodologia === 'GRUPAL'
      ? [...groupedMembers.querySelectorAll('[data-member-check]')]
      : [checkNumberInput];
  }

  function updateAddButton() {
    const checkNumber = checkNumberInput.value.trim();
    addButton.disabled = checkingAvailability
      || sendingPlanilla
      || !currentRequest
      || !currentRequest.supported
      || !validCheckNumber(checkNumber);
    if (addGroupButton) {
      const checks = currentCheckInputs().map((input) => input.value.trim());
      addGroupButton.disabled = checkingAvailability
        || sendingPlanilla
        || currentRequest?.metodologia !== 'GRUPAL'
        || !currentRequest.supported
        || checks.length === 0
        || checks.some((value) => !validCheckNumber(value));
    }
  }

  function renderGroupedRequest(data, requestNumber) {
    individualSection.classList.add('d-none');
    groupedSection.classList.remove('d-none');
    groupedSection.querySelector('[data-group-request-number]').textContent = requestNumber;
    groupedSection.querySelector('[data-group-count]').textContent = `${data.miembros.length} miembros`;
    groupedMembers.innerHTML = data.miembros.map((miembro, index) => {
      const amount = (value) => miembro.calculado ? currency.format(value) : 'No confirmado';
      const disabled = miembro.calculado ? '' : 'disabled';
      return `
        <section class="card mb-3" data-group-member="${escapeHtml(miembro.miembroId)}">
          <div class="card-header bg-white p-4 pb-0 border-0 d-flex justify-content-between align-items-center">
            <h3 class="h5 mb-0">Informacion de la solicitud</h3>
            <span class="badge ${miembro.calculado ? 'text-bg-success' : 'text-bg-warning'}">Miembro ${index + 1} de ${data.miembros.length}</span>
          </div>
          <div class="card-body p-4">
            <div class="row g-3">
              <div class="col-md-6"><label class="form-label">Cliente</label><input class="form-control readonly-field" value="${escapeHtml(miembro.cliente || '')}" readonly></div>
              <div class="col-md-3"><label class="form-label">Monto aprobado</label><input class="form-control readonly-field" value="${escapeHtml(amount(miembro.montoAprobado))}" readonly></div>
              <div class="col-md-3"><label class="form-label">Monto cancelado</label><input class="form-control readonly-field" value="${escapeHtml(amount(miembro.montoCancelado))}" readonly></div>
              <div class="col-md-3"><label class="form-label">Descuentos</label><input class="form-control readonly-field" value="${escapeHtml(amount(miembro.descuentos))}" readonly></div>
              <div class="col-md-3"><label class="form-label">Monto cheque</label><input class="form-control readonly-field" value="${escapeHtml(amount(miembro.montoCheque))}" readonly></div>
              <div class="col-md-3"><label class="form-label">Fecha y hora</label><input class="form-control readonly-field" value="${escapeHtml(new Date(data.fechaExtraccion).toLocaleString('es-GT'))}" readonly></div>
              <div class="col-md-3"><label class="form-label">Metodologia</label><input class="form-control readonly-field" value="GRUPAL" readonly></div>
              <div class="col-md-6"><label class="form-label">Agencia</label><input class="form-control readonly-field" value="${escapeHtml(data.agencia || 'Sin agencia asignada')}" readonly></div>
              <div class="col-md-6"><label class="form-label fw-semibold" for="numeroCheque-${index}">Numero de cheque</label><input class="form-control" id="numeroCheque-${index}" data-member-check data-member-index="${index}" type="text" placeholder="Ingresa el numero de cheque" pattern="(?:[A-Za-z0-9]|-){1,50}" maxlength="50" autocomplete="off" ${disabled}></div>
            </div>
            <div class="form-text mt-3">Estado: ${miembro.calculado ? 'calculo financiero confirmado' : 'calculo financiero no confirmado'}.</div>
          </div>
        </section>`;
    }).join('');
  }

  function clearGroupedRequest() {
    groupedMembers.innerHTML = '';
    groupedSection.classList.add('d-none');
    individualSection.classList.remove('d-none');
  }

  function clearCurrentRequest({ clearRequestNumber = true } = {}) {
    currentRequest = null;
    if (clearRequestNumber) solicitudForm.elements.numeroSolicitud.value = '';
    clearRequestData();
    clearGroupedRequest();
    updateAddButton();
  }

  function renderDraft() {
    draftCount.textContent = `${draftRequests.length} ${draftRequests.length === 1 ? 'registro' : 'registros'}`;
    sendButton.disabled = sendingPlanilla || draftRequests.length === 0;
    sendButton.innerHTML = sendingPlanilla
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Enviando'
      : '<i class="bi bi-send-check me-2"></i>Enviar planilla';

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
          <td><button class="btn btn-sm btn-outline-danger" type="button" data-remove-draft="${index}" aria-label="Eliminar solicitud ${escapeHtml(item.numeroSolicitud)}" ${sendingPlanilla ? 'disabled' : ''}><i class="bi bi-trash"></i><span class="ms-1">Eliminar</span></button></td>
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

    availabilityRequests.cancel();
    checkingAvailability = false;
    const request = distributionRequests.start();
    clearCurrentRequest({ clearRequestNumber: false });
    loadButton.disabled = true;
    loadButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Consultando';
    showFeedback('Consultando la distribucion de desembolso...', 'info');

    try {
      const response = await fetch(`/api/solicitudes/${encodeURIComponent(requestNumber)}/distribucion`, {
        headers: { accept: 'application/json' },
        signal: request.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!distributionRequests.isCurrent(request)) return;

      if (!response.ok || !payload?.success) {
        if (payload?.data?.miembros?.length) {
          renderGroupedRequest({
            ...payload.data,
            fechaExtraccion: new Date().toISOString(),
            agencia: '',
          }, requestNumber);
        }
        if (payload?.data?.metodologia) {
          solicitudForm.elements.metodologia.value = payload.data.metodologia;
        }
        throw new Error(payload?.error?.message || 'No fue posible obtener la informacion de la solicitud.');
      }

      if (payload.data.metodologia === 'GRUPAL') {
        renderGroupedRequest(payload.data, requestNumber);
        currentRequest = {
          numeroSolicitud: requestNumber,
          metodologia: 'GRUPAL',
          fechaExtraccion: payload.data.fechaExtraccion,
          miembros: payload.data.miembros,
          supported: payload.data.supported === true,
        };
      } else {
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
        submissionToken: payload.data.submissionToken,
        supported: payload.data.supported === true,
        };
      }
      updateAddButton();
      const warningMessage = payload.data.warnings?.join(' ');
      showFeedback(warningMessage || 'Datos obtenidos correctamente. Revisa la informacion antes de continuar.', warningMessage ? 'warning' : 'success');
    } catch (error) {
      if (distributionRequests.isCurrent(request) && error.name !== 'AbortError') {
        showFeedback(error.message || 'No fue posible obtener la informacion de la solicitud.', 'danger');
      }
    } finally {
      if (distributionRequests.finish(request)) {
        loadButton.disabled = false;
        loadButton.innerHTML = '<i class="bi bi-search me-2"></i>Obtener datos';
      }
    }
  });

  solicitudForm.elements.numeroCheque.addEventListener('input', () => {
    availabilityRequests.cancel();
    checkingAvailability = false;
    loadButton.disabled = false;
    updateAddButton();
  });
  groupedMembers.addEventListener('input', updateAddButton);
  solicitudForm.elements.numeroSolicitud.addEventListener('input', () => {
    const hadPendingRequest = distributionRequests.hasActive();
    const changedLoadedRequest = currentRequest
      && solicitudForm.elements.numeroSolicitud.value.trim() !== currentRequest.numeroSolicitud;
    const hasDisplayedGroup = !groupedSection.classList.contains('d-none');
    distributionRequests.cancel();
    availabilityRequests.cancel();
    checkingAvailability = false;
    loadButton.disabled = false;
    loadButton.innerHTML = '<i class="bi bi-search me-2"></i>Obtener datos';
    if (hadPendingRequest || changedLoadedRequest || hasDisplayedGroup) {
      clearCurrentRequest({ clearRequestNumber: false });
      showFeedback('El numero de solicitud cambio. Pulsa Obtener datos para consultar nuevamente.', 'info');
    }
  });

  async function addCurrentRequest() {
    if (sendingPlanilla) return;
    if (!currentRequest || !currentRequest.supported) {
      showFeedback('Consulta nuevamente una solicitud soportada antes de agregarla.', 'warning');
      updateAddButton();
      return;
    }

    const requestToAdd = currentRequest;
    const inputs = currentCheckInputs();
    const checkNumbersToAdd = inputs.map((input) => input.value.trim());
    if (checkNumbersToAdd.some((numeroCheque) => !validCheckNumber(numeroCheque))) {
      showFeedback('Ingresa un numero de cheque valido de hasta 50 caracteres alfanumericos o guiones.', 'warning');
      inputs.find((input) => !validCheckNumber(input.value.trim()))?.focus();
      return;
    }
    if (draftRequests.some((item) => item.numeroSolicitud === requestToAdd.numeroSolicitud)) {
      showFeedback('Esta solicitud ya fue agregada al borrador.', 'warning');
      return;
    }
    const normalizedChecks = checkNumbersToAdd.map((value) => value.toUpperCase());
    if (new Set(normalizedChecks).size !== normalizedChecks.length
        || draftRequests.some((item) => normalizedChecks.includes(item.numeroCheque.toUpperCase()))) {
      showFeedback('Este numero de cheque ya fue agregado al borrador.', 'warning');
      return;
    }
    if (draftRequests.length + checkNumbersToAdd.length > maxDraftRequests) {
      showFeedback(`El borrador admite como maximo ${maxDraftRequests} solicitudes por envio.`, 'warning');
      return;
    }

    const requestsToAdd = requestToAdd.metodologia === 'GRUPAL'
      ? requestToAdd.miembros.map((miembro, index) => ({ ...miembro, numeroCheque: checkNumbersToAdd[index] }))
      : [{ ...requestToAdd, numeroCheque: checkNumbersToAdd[0] }];
    const normalizedRequests = requestsToAdd.map((item) => ({
      ...item,
      montoAprobado: toCents(item.montoAprobado),
      montoCancelado: toCents(item.montoCancelado),
      descuentos: toCents(item.descuentos),
      montoCheque: toCents(item.montoCheque),
    }));
    if (normalizedRequests.some((item) => [item.montoAprobado, item.montoCancelado, item.descuentos, item.montoCheque].includes(null))) {
      showFeedback('La solicitud contiene datos monetarios invalidos y no puede agregarse.', 'danger');
      return;
    }
    if (normalizedRequests.some((item) => item.montoAprobado !== item.montoCancelado + item.descuentos + item.montoCheque)) {
      showFeedback('Los montos de la solicitud no son consistentes y no puede agregarse.', 'danger');
      return;
    }

    checkingAvailability = true;
    updateAddButton();
    loadButton.disabled = true;
    const availabilityRequest = availabilityRequests.start();
    try {
      const responses = await Promise.all(checkNumbersToAdd.map((numeroCheque) => fetch(`/api/solicitudes/${encodeURIComponent(requestToAdd.numeroSolicitud)}/disponibilidad?numeroCheque=${encodeURIComponent(numeroCheque)}`, {
        headers: { accept: 'application/json' }, signal: availabilityRequest.signal,
      })));
      const payloads = await Promise.all(responses.map((response) => response.json().catch(() => null)));
      if (!availabilityRequests.isCurrent(availabilityRequest)) return;
      const failedIndex = responses.findIndex((response, index) => !response.ok || !payloads[index]?.success);
      if (failedIndex >= 0) {
        throw new Error(payloads[failedIndex]?.error?.message || 'No fue posible comprobar la disponibilidad.');
      }
      if (
        currentRequest !== requestToAdd
        || solicitudForm.elements.numeroSolicitud.value.trim() !== requestToAdd.numeroSolicitud
        || currentCheckInputs().some((input, index) => input.value.trim() !== checkNumbersToAdd[index])
      ) {
        showFeedback('La consulta o el numero de cheque cambio. Revisa los datos antes de agregar.', 'warning');
        return;
      }
      if (payloads.some((payload) => !payload.data.solicitudDisponible)) {
        showFeedback('Esta solicitud ya fue utilizada en una planilla anterior.', 'warning');
        return;
      }
      if (payloads.some((payload) => !payload.data.chequeDisponible)) {
        showFeedback('Este numero de cheque ya fue utilizado en una planilla anterior.', 'warning');
        return;
      }

      const draftApprovedTotal = draftRequests.reduce((total, item) => total + item.montoAprobado, 0);
      const addedApprovedTotal = normalizedRequests.reduce((total, item) => total + item.montoAprobado, 0);
      if (!Number.isSafeInteger(addedApprovedTotal)
          || !Number.isSafeInteger(draftApprovedTotal + addedApprovedTotal)) {
        showFeedback('El total del borrador excede el monto maximo permitido.', 'danger');
        return;
      }

      draftRequests.push(...normalizedRequests.map((item) => ({
        ...item,
        numeroSolicitud: requestToAdd.numeroSolicitud,
        metodologia: requestToAdd.metodologia,
        fechaExtraccion: requestToAdd.fechaExtraccion,
      })));
      renderDraft();
      clearCurrentRequest();
      showFeedback('Solicitud agregada al borrador. Envia la planilla para guardarla.', 'success');
      solicitudForm.elements.numeroSolicitud.focus();
    } catch (error) {
      if (availabilityRequests.isCurrent(availabilityRequest) && error.name !== 'AbortError') {
        showFeedback(error.message || 'No fue posible agregar la solicitud al borrador.', 'danger');
      }
    } finally {
      if (availabilityRequests.finish(availabilityRequest)) {
        checkingAvailability = false;
        loadButton.disabled = false;
        updateAddButton();
      }
    }
  }
  addButton.addEventListener('click', addCurrentRequest);
  addGroupButton.addEventListener('click', addCurrentRequest);
  solicitudForm.querySelector('[data-clear-group]').addEventListener('click', () => {
    clearCurrentRequest();
    feedback.textContent = '';
    feedback.className = 'alert d-none mt-3 mb-0';
  });

  draftBody.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-draft]');
    if (!removeButton || sendingPlanilla) return;
    const selected = draftRequests[Number(removeButton.dataset.removeDraft)];
    if (selected?.metodologia === 'GRUPAL') {
      for (let index = draftRequests.length - 1; index >= 0; index -= 1) {
        if (draftRequests[index].numeroSolicitud === selected.numeroSolicitud) draftRequests.splice(index, 1);
      }
    } else {
      draftRequests.splice(Number(removeButton.dataset.removeDraft), 1);
    }
    renderDraft();
    showFeedback(selected?.metodologia === 'GRUPAL'
      ? 'Grupo eliminado del borrador.'
      : 'Solicitud eliminada del borrador.', 'info');
  });

  sendButton.addEventListener('click', async () => {
    if (sendingPlanilla || planillaSubmitter.isPending()) return;
    if (draftRequests.length === 0) {
      showFeedback('Agrega al menos una solicitud antes de enviar la planilla.', 'warning');
      renderDraft();
      return;
    }

    sendingPlanilla = true;
    updateAddButton();
    renderDraft();
    showFeedback('Enviando y guardando la planilla...', 'info');
    try {
      const planilla = await planillaSubmitter.submit(draftRequests);
      draftRequests.length = 0;
      renderDraft();
      showFeedback(`Planilla ${planilla.codigo} enviada y guardada correctamente.`, 'success');
    } catch (error) {
      showFeedback(error.message || 'No fue posible enviar la planilla. El borrador se conserva.', 'danger');
    } finally {
      sendingPlanilla = false;
      updateAddButton();
      renderDraft();
    }
  });

  solicitudForm.querySelector('[data-clear-form]').addEventListener('click', () => {
    distributionRequests.cancel();
    availabilityRequests.cancel();
    checkingAvailability = false;
    solicitudForm.reset();
    currentRequest = null;
    clearGroupedRequest();
    loadButton.disabled = false;
    loadButton.innerHTML = '<i class="bi bi-search me-2"></i>Obtener datos';
    feedback.textContent = '';
    feedback.className = 'alert d-none mt-3 mb-0';
    updateAddButton();
  });
}
