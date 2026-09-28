const accountingFilters = document.querySelector('[data-accounting-filters]');

if (accountingFilters) {
  const rows = [...document.querySelectorAll('[data-planilla-row]')];
  const emptyRow = document.querySelector('[data-planillas-empty]');
  const count = document.querySelector('[data-planilla-count]');

  const applyPlanillaFilters = () => {
    const date = accountingFilters.querySelector('[data-planilla-date]').value;
    const agency = accountingFilters.querySelector('[data-planilla-agency]').value;
    const status = accountingFilters.querySelector('[data-planilla-status]').value;
    const search = accountingFilters.querySelector('[data-planilla-search]').value.trim().toLowerCase();
    let visible = 0;

    rows.forEach((row) => {
      const matches = (!date || row.dataset.date === date)
        && (!agency || row.dataset.agency === agency)
        && (!status || row.dataset.status === status)
        && (!search || row.dataset.search.includes(search));
      row.classList.toggle('d-none', !matches);
      if (matches) visible += 1;
    });

    emptyRow.classList.toggle('d-none', visible !== 0);
    count.textContent = `${visible} ${visible === 1 ? 'resultado' : 'resultados'}`;
  };

  accountingFilters.addEventListener('input', applyPlanillaFilters);
  accountingFilters.addEventListener('change', applyPlanillaFilters);
  accountingFilters.addEventListener('reset', () => window.setTimeout(applyPlanillaFilters));
  applyPlanillaFilters();
}

const processButton = document.querySelector('[data-prototype-process]');

if (processButton) {
  processButton.addEventListener('click', () => {
    const feedback = document.querySelector('[data-accounting-feedback]');
    feedback.textContent = 'Procesamiento pendiente de conexion con backend. No se modificaron datos.';
    feedback.classList.remove('d-none');
  });
}
