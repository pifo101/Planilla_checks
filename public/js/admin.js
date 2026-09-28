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

const newUserForm = document.querySelector('[data-new-user-form]');

if (newUserForm) {
  newUserForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const feedback = newUserForm.querySelector('[data-user-form-feedback]');
    feedback.textContent = 'Funcionalidad pendiente de conexion con backend. No se guardaron datos.';
    feedback.classList.remove('d-none');
  });
}
