const adminFilters = document.querySelector('[data-admin-filters]');
const adminFeedback = document.querySelector('[data-admin-feedback]');

function showAdminFeedback(message) {
  if (!adminFeedback) return;
  adminFeedback.textContent = `${message}. Funcionalidad pendiente de conexion con backend.`;
  adminFeedback.classList.remove('d-none');
  adminFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

if (adminFilters) {
  const rows = [...document.querySelectorAll('[data-user-row]')];
  const emptyRow = document.querySelector('[data-users-empty]');
  const count = document.querySelector('[data-user-count]');

  const applyUserFilters = () => {
    const search = adminFilters.querySelector('[data-user-search]').value.trim().toLowerCase();
    const role = adminFilters.querySelector('[data-user-role]').value;
    const agency = adminFilters.querySelector('[data-user-agency]').value;
    const status = adminFilters.querySelector('[data-user-status]').value;
    let visible = 0;

    rows.forEach((row) => {
      const matches = (!search || row.dataset.search.includes(search))
        && (!role || row.dataset.role === role)
        && (!agency || row.dataset.agency === agency)
        && (!status || row.dataset.status === status);
      row.classList.toggle('d-none', !matches);
      if (matches) visible += 1;
    });

    emptyRow.classList.toggle('d-none', visible !== 0);
    count.textContent = `${visible} ${visible === 1 ? 'resultado' : 'resultados'}`;
  };

  adminFilters.addEventListener('input', applyUserFilters);
  adminFilters.addEventListener('change', applyUserFilters);
  adminFilters.addEventListener('reset', () => window.setTimeout(applyUserFilters));
}

document.querySelectorAll('[data-prototype-action]').forEach((button) => {
  button.addEventListener('click', () => showAdminFeedback(button.dataset.prototypeAction));
});

const accountForm = document.querySelector('[data-account-form]');

if (accountForm) {
  const fields = {
    name: accountForm.elements.nombre,
    email: accountForm.elements.correo,
    password: accountForm.querySelector('#password'),
    confirmation: accountForm.querySelector('#confirmPassword'),
    role: accountForm.elements.rol,
    agency: accountForm.elements.agencia,
  };
  const agencyRequired = accountForm.querySelector('[data-agency-required]');
  const agencyContext = accountForm.querySelector('[data-agency-context]');
  const agencyField = accountForm.querySelector('[data-agency-field]');
  const successFeedback = document.querySelector('[data-account-success]');
  const accountSubmit = accountForm.querySelector('[data-account-submit]');
  const errorIds = {
    fullName: 'fullNameError',
    email: 'emailError',
    password: 'passwordError',
    confirmPassword: 'confirmPasswordError',
    newRole: 'roleError',
    newAgency: 'agencyError',
  };

  const setInvalid = (field, message) => {
    const error = document.getElementById(errorIds[field.id]);
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    return false;
  };

  const clearInvalid = (field) => {
    field.classList.remove('is-invalid');
    field.removeAttribute('aria-invalid');
  };

  const updateAgencyState = () => {
    const isAssistant = fields.role.value === 'ASISTENTE';
    fields.agency.disabled = !isAssistant;
    fields.agency.required = isAssistant;
    agencyRequired.classList.toggle('d-none', !isAssistant);
    agencyField.classList.toggle('agency-required', isAssistant);
    agencyContext.textContent = isAssistant
      ? 'La agencia identificara la procedencia de las planillas de este usuario.'
      : 'La agencia no aplica para el rol seleccionado.';

    if (isAssistant) {
      if (fields.agency.value === 'NO_APLICA') fields.agency.value = '';
    } else {
      fields.agency.value = 'NO_APLICA';
      clearInvalid(fields.agency);
    }
  };

  const validateForm = () => {
    Object.values(fields).forEach(clearInvalid);
    let valid = true;

    if (!fields.name.value.trim()) valid = setInvalid(fields.name, 'Ingresa el nombre completo.');

    if (!fields.email.value.trim()) {
      valid = setInvalid(fields.email, 'Ingresa el correo electronico.');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) {
      valid = setInvalid(fields.email, 'Ingresa un correo electronico valido.');
    }

    if (!fields.password.value) valid = setInvalid(fields.password, 'Ingresa una contrasena.');

    if (!fields.confirmation.value) {
      valid = setInvalid(fields.confirmation, 'Confirma la contrasena.');
    } else if (fields.password.value !== fields.confirmation.value) {
      valid = setInvalid(fields.confirmation, 'Las contrasenas no coinciden.');
    }

    if (!fields.role.value) valid = setInvalid(fields.role, 'Selecciona un rol.');

    if (fields.role.value === 'ASISTENTE' && !fields.agency.value) {
      valid = setInvalid(fields.agency, 'Selecciona una agencia para el Asistente de Agencia.');
    }

    return valid;
  };

  fields.role.addEventListener('change', () => {
    clearInvalid(fields.role);
    updateAgencyState();
  });

  Object.values(fields).forEach((field) => {
    field.addEventListener('input', () => {
      clearInvalid(field);
      successFeedback.classList.add('d-none');
    });
  });

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = document.getElementById(button.dataset.passwordToggle);
      const showPassword = field.type === 'password';
      const isConfirmation = field.id === 'confirmPassword';
      field.type = showPassword ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(showPassword));
      button.setAttribute('aria-label', `${showPassword ? 'Ocultar' : 'Mostrar'} ${isConfirmation ? 'confirmacion de contrasena' : 'contrasena'}`);
      button.querySelector('i').className = `bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`;
    });
  });

  accountForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!validateForm()) {
      accountForm.querySelector('.is-invalid').focus();
      return;
    }

    // DEMO / MOCK: replace this feedback with the backend account-creation flow later.
    successFeedback.classList.remove('d-none');
    successFeedback.focus();
    accountForm.reset();
    updateAgencyState();
  });

  accountSubmit.addEventListener('click', () => accountForm.requestSubmit());

  updateAgencyState();
}
