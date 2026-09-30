(function initializePlanillaSubmission(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.createPlanillaSubmitter = api.createPlanillaSubmitter;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function buildSubmission(draftRequests) {
    return {
      solicitudes: draftRequests.map((item) => ({
        numeroSolicitud: item.numeroSolicitud,
        ...(item.miembroId ? { miembroId: item.miembroId } : {}),
        numeroCheque: item.numeroCheque,
        submissionToken: item.submissionToken,
      })),
    };
  }

  function createPlanillaSubmitter(fetchImpl) {
    let pending = false;

    return {
      isPending: () => pending,
      async submit(draftRequests) {
        if (pending) {
          const error = new Error('Ya hay un envio de planilla en curso.');
          error.code = 'SUBMISSION_IN_PROGRESS';
          throw error;
        }

        pending = true;
        try {
          const response = await fetchImpl('/api/planillas', {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify(buildSubmission(draftRequests)),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success) {
            const error = new Error(payload?.error?.message || 'No fue posible enviar la planilla.');
            error.code = payload?.error?.code || 'PLANILLA_SUBMISSION_FAILED';
            error.data = payload?.data;
            throw error;
          }
          return payload.data.planilla;
        } finally {
          pending = false;
        }
      },
    };
  }

  return { buildSubmission, createPlanillaSubmitter };
}));
