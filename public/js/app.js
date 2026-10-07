const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
const sidebar = document.querySelector('.app-sidebar');
const mobileSidebar = window.matchMedia('(max-width: 991.98px)');

function setSidebarOpen(open, { restoreFocus = false } = {}) {
  if (!sidebarToggle || !sidebar) return;
  const shouldOpen = mobileSidebar.matches && open;
  if (!shouldOpen && (restoreFocus || sidebar.contains(document.activeElement))) sidebarToggle.focus();
  document.body.classList.toggle('sidebar-open', shouldOpen);
  sidebarToggle.setAttribute('aria-expanded', String(shouldOpen));
  sidebar.inert = mobileSidebar.matches && !shouldOpen;
  sidebar.setAttribute('aria-hidden', String(mobileSidebar.matches && !shouldOpen));
  sidebarToggle.setAttribute('aria-label', shouldOpen ? 'Cerrar menu' : 'Abrir menu');
}

if (sidebarToggle && sidebar) {
  setSidebarOpen(false);
  sidebarToggle.addEventListener('click', () => {
    setSidebarOpen(!document.body.classList.contains('sidebar-open'));
  });
  mobileSidebar.addEventListener('change', () => setSidebarOpen(false));
}

document.addEventListener('click', (event) => {
  if (
    document.body.classList.contains('sidebar-open')
    && !event.target.closest('.app-sidebar')
    && !event.target.closest('[data-sidebar-toggle]')
  ) {
    setSidebarOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
    setSidebarOpen(false, { restoreFocus: true });
  }
});

document.querySelectorAll('[data-transfer-form]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    const row = form.closest('[data-transfer-row]');
    if (!row || row.dataset.transferPending === 'true') {
      event.preventDefault();
      return;
    }
    if (!window.confirm(form.dataset.confirm)) {
      event.preventDefault();
      return;
    }

    row.dataset.transferPending = 'true';
    row.querySelectorAll('[data-transfer-actions] button').forEach((button) => {
      button.disabled = true;
    });
    const submittedButton = event.submitter;
    if (submittedButton) {
      submittedButton.textContent = 'Procesando...';
      submittedButton.setAttribute('aria-busy', 'true');
    }
  });
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
  const actaSection = document.querySelector('[data-daily-acta]');
  const actaForm = actaSection.querySelector('[data-acta-form]');
  const actaInput = actaSection.querySelector('[data-acta-input]');
  const actaCurrent = actaSection.querySelector('[data-acta-current]');
  const actaHelp = actaSection.querySelector('[data-acta-help]');
  const actaFeedback = actaSection.querySelector('[data-acta-feedback]');
  const saveActaButton = actaSection.querySelector('[data-save-acta]');
  const currency = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
  const operationalDateTime = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Guatemala',
  });
  const csrfToken = document.querySelector('[data-csrf-token]')?.dataset.csrfToken || '';
  let actaAvailable = actaSection.dataset.actaAvailable === 'true';
  let currentRequest = null;
  let checkingAvailability = false;
  let sendingPlanilla = false;
  const distributionRequests = createRequestGuard();
  const availabilityRequests = createRequestGuard();
  const planillaSubmitter = createPlanillaSubmitter(fetch, csrfToken);
  const draftRequests = [];

  function showFeedback(message, tone) {
    feedback.textContent = message;
    feedback.className = `alert alert-${tone} mt-3 mb-0`;
  }

  function showActaFeedback(message, tone) {
    actaFeedback.textContent = message;
    actaFeedback.className = `alert alert-${tone} mt-3 mb-0`;
  }

  function renderActa(fecha, acta, message) {
    actaAvailable = Boolean(acta);
    actaSection.dataset.actaAvailable = String(actaAvailable);
    actaCurrent.value = acta?.numeroActa || '';
    actaCurrent.classList.toggle('d-none', !actaAvailable);
    actaForm.classList.toggle('d-none', actaAvailable);
    actaHelp.textContent = actaAvailable
      ? `Acta global vigente para ${fecha}. No puede modificarse durante el dia.`
      : `No hay acta registrada para hoy (${fecha}). Ingrese el numero de acta para continuar.`;
    if (message) showActaFeedback(message, actaAvailable ? 'success' : 'warning');
    renderDraft();
  }

  function renderUnconfirmedActa(message) {
    actaAvailable = false;
    actaSection.dataset.actaAvailable = 'false';
    actaCurrent.value = '';
    actaCurrent.classList.add('d-none');
    actaForm.classList.remove('d-none');
    actaHelp.textContent = 'No fue posible confirmar el acta vigente. Intenta guardarla nuevamente para validar el estado actual.';
    showActaFeedback(message, 'danger');
    renderDraft();
  }

  async function refreshDailyActa(message) {
    try {
      const response = await fetch('/api/acta-diaria', { headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message);
      renderActa(payload.data.fecha, payload.data.acta, message);
    } catch (error) {
      renderUnconfirmedActa(error.message || 'No fue posible actualizar el acta del dia.');
    }
  }

  function formatOperationalDateTime(value) {
    if (!value) return 'No disponible';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'No disponible' : operationalDateTime.format(date);
  }

  function setData(data) {
    solicitudForm.elements.cliente.value = data.cliente || '';
    solicitudForm.elements.montoAprobado.value = currency.format(data.montoAprobado);
    solicitudForm.elements.montoCancelado.value = currency.format(data.montoCancelado);
    solicitudForm.elements.descuentos.value = currency.format(data.descuentos);
    solicitudForm.elements.montoCheque.value = currency.format(data.montoCheque);
    solicitudForm.elements.fechaHora.value = formatOperationalDateTime(data.fechaExtraccion);
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
    const memberCards = data.miembros.map((miembro, index) => {
      const amount = (value) => miembro.calculado ? currency.format(value) : 'No confirmado';
      const card = document.createElement('section');
      card.className = 'card mb-3';
      card.dataset.groupMember = String(miembro.miembroId ?? '');

      const header = document.createElement('div');
      header.className = 'card-header bg-white p-4 pb-0 border-0 d-flex flex-wrap justify-content-between align-items-center gap-2';
      const heading = document.createElement('h3');
      heading.className = 'h5 mb-0';
      heading.textContent = 'Informacion de la solicitud';
      const badge = document.createElement('span');
      badge.className = `badge ${miembro.calculado ? 'text-bg-success' : 'text-bg-warning'}`;
      badge.textContent = `Miembro ${index + 1} de ${data.miembros.length}`;
      header.append(heading, badge);

      const cardBody = document.createElement('div');
      cardBody.className = 'card-body p-4';
      const row = document.createElement('div');
      row.className = 'row g-3';
      const appendField = (columnClass, suffix, labelText, value, { editable = false } = {}) => {
        const column = document.createElement('div');
        column.className = columnClass;
        const inputId = `grupo-${index}-${suffix}`;
        const label = document.createElement('label');
        label.className = `form-label${editable ? ' fw-semibold' : ''}`;
        label.htmlFor = inputId;
        label.textContent = labelText;
        const input = document.createElement('input');
        input.className = editable ? 'form-control' : 'form-control readonly-field';
        input.id = inputId;
        input.type = 'text';
        input.value = String(value ?? '');
        input.readOnly = !editable;
        if (editable) {
          input.dataset.memberCheck = '';
          input.dataset.memberIndex = String(index);
          input.placeholder = 'Ingresa el numero de cheque';
          input.pattern = '(?:[A-Za-z0-9]|-){1,50}';
          input.maxLength = 50;
          input.autocomplete = 'off';
          input.disabled = !miembro.calculado;
        }
        column.append(label, input);
        row.append(column);
      };

      appendField('col-md-6', 'cliente', 'Cliente', miembro.cliente || 'No disponible');
      appendField('col-md-3', 'monto-aprobado', 'Monto aprobado', amount(miembro.montoAprobado));
      appendField('col-md-3', 'monto-cancelado', 'Monto cancelado', amount(miembro.montoCancelado));
      appendField('col-md-3', 'descuentos', 'Descuentos', amount(miembro.descuentos));
      appendField('col-md-3', 'monto-cheque', 'Monto cheque', amount(miembro.montoCheque));
      appendField('col-md-3', 'fecha-hora', 'Fecha y hora', formatOperationalDateTime(data.fechaExtraccion));
      appendField('col-md-3', 'metodologia', 'Metodologia', 'GRUPAL');
      appendField('col-md-6', 'agencia', 'Agencia', data.agencia || 'No disponible');
      appendField('col-md-6', 'numero-cheque', 'Numero de cheque', '', { editable: true });

      const status = document.createElement('div');
      status.className = 'form-text mt-3';
      status.textContent = `Estado: ${miembro.calculado ? 'calculo financiero confirmado' : 'calculo financiero no confirmado'}.`;
      cardBody.append(row, status);
      card.append(header, cardBody);
      return card;
    });
    groupedMembers.replaceChildren(...memberCards);
  }

  function clearGroupedRequest() {
    groupedMembers.replaceChildren();
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
    sendButton.disabled = sendingPlanilla || !actaAvailable || draftRequests.length === 0;
    sendButton.innerHTML = sendingPlanilla
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Enviando'
      : '<i class="bi bi-send-check me-2"></i>Enviar planilla';

    if (draftRequests.length === 0) {
      draftBody.innerHTML = '<tr><td class="text-center text-muted py-4" colspan="10">No hay solicitudes agregadas.</td></tr>';
    } else {
      const rows = draftRequests.map((item, index) => {
        const row = document.createElement('tr');
        [
          item.numeroSolicitud,
          item.cliente,
          formatCents(item.montoAprobado),
          formatCents(item.montoCancelado),
          formatCents(item.descuentos),
          formatCents(item.montoCheque),
          item.numeroCheque,
          item.metodologia,
          formatOperationalDateTime(item.fechaExtraccion),
        ].forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = String(value ?? '');
          row.append(cell);
        });
        const actionCell = document.createElement('td');
        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-sm btn-outline-danger';
        removeButton.type = 'button';
        removeButton.dataset.removeDraft = String(index);
        removeButton.setAttribute('aria-label', `Eliminar solicitud ${item.numeroSolicitud}`);
        removeButton.disabled = sendingPlanilla;
        const icon = document.createElement('i');
        icon.className = 'bi bi-trash';
        const label = document.createElement('span');
        label.className = 'ms-1';
        label.textContent = 'Eliminar';
        removeButton.append(icon, label);
        actionCell.append(removeButton);
        row.append(actionCell);
        return row;
      });
      draftBody.replaceChildren(...rows);
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

  async function fetchDistribution() {
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
            fechaExtraccion: null,
            agencia: null,
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
  }

  solicitudForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const requestInput = solicitudForm.elements.numeroSolicitud;
    if (event.submitter === loadButton || document.activeElement === requestInput) fetchDistribution();
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

  actaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const numeroActa = actaInput.value.trim();
    saveActaButton.disabled = true;
    showActaFeedback('Guardando el acta del dia...', 'info');
    try {
      const response = await fetch('/api/acta-diaria', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ numeroActa }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 409 && payload?.data?.acta) {
        renderActa(payload.data.acta.fecha, payload.data.acta, 'Otra persona registro el acta primero. Se utilizara el valor vigente.');
        return;
      }
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'No fue posible registrar el acta del dia.');
      }
      actaInput.value = '';
      renderActa(payload.data.acta.fecha, payload.data.acta, 'Acta del dia registrada correctamente.');
    } catch (error) {
      showActaFeedback(error.message || 'No fue posible registrar el acta del dia.', 'danger');
    } finally {
      saveActaButton.disabled = false;
    }
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
      if (error.code === 'DAILY_ACTA_REQUIRED') {
        await refreshDailyActa('La fecha operativa cambio. Registra el acta del nuevo dia para enviar el borrador.');
      }
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
