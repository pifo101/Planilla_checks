const adminFilters = document.querySelector('[data-admin-filters]');

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

function syncAgency(roleField, agencyField, container = null) {
  const assistant = roleField.value === 'ASISTENTE';
  agencyField.disabled = !assistant;
  agencyField.required = assistant;
  if (!assistant) agencyField.value = '';
  if (container) container.classList.toggle('d-none', !assistant);
}

document.querySelectorAll('[data-user-access-form]').forEach((form) => {
  const row = form.closest('tr');
  const role = row.querySelector('[data-access-role]');
  const agency = row.querySelector('[data-access-agency]');
  syncAgency(role, agency);
  role.addEventListener('change', () => syncAgency(role, agency));
});

const accountForm = document.querySelector('[data-account-form]');
if (accountForm) {
  const role = accountForm.querySelector('[data-access-role]');
  const agency = accountForm.querySelector('[data-access-agency]');
  const agencyContainer = accountForm.querySelector('[data-agency-field]');
  const password = accountForm.elements.password;
  const confirmation = accountForm.elements.confirmPassword;

  syncAgency(role, agency, agencyContainer);
  role.addEventListener('change', () => syncAgency(role, agency, agencyContainer));

  accountForm.addEventListener('submit', (event) => {
    confirmation.setCustomValidity(password.value === confirmation.value ? '' : 'Las contrasenas no coinciden.');
    if (!accountForm.checkValidity()) {
      event.preventDefault();
      accountForm.classList.add('was-validated');
      accountForm.querySelector(':invalid')?.focus();
    }
  });

  [password, confirmation].forEach((field) => field.addEventListener('input', () => {
    confirmation.setCustomValidity(password.value === confirmation.value ? '' : 'Las contrasenas no coinciden.');
  }));
}

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
