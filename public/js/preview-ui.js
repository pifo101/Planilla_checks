(() => {
  const demoMessage = 'Accion deshabilitada: esta vista previa usa datos ficticios y no guarda cambios.';

  function showDemoNotice() {
    let notice = document.querySelector('[data-preview-notice]');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'preview-notice';
      notice.dataset.previewNotice = '';
      notice.setAttribute('role', 'status');
      document.body.append(notice);
    }
    notice.textContent = demoMessage;
    window.clearTimeout(showDemoNotice.timeout);
    showDemoNotice.timeout = window.setTimeout(() => notice.remove(), 5000);
  }

  document.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    showDemoNotice();
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-send-planilla], [data-save-acta], [data-fetch-distribution]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showDemoNotice();
    }
  }, true);

  document.querySelectorAll('form[method="post"] button, [data-save-acta], [data-fetch-distribution], [data-add-to-draft], [data-add-group-to-draft], [data-send-planilla]').forEach((button) => {
    button.disabled = true;
    button.classList.add('preview-disabled-action');
    button.title = demoMessage;
    button.setAttribute('aria-disabled', 'true');
  });

  window.fetch = async () => new Response(JSON.stringify({
    success: false,
    error: { code: 'PREVIEW_ONLY', message: demoMessage },
  }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  });

  if (navigator.sendBeacon) navigator.sendBeacon = () => false;
})();
