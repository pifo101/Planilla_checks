(function exposeRequestGuard(root) {
  function createRequestGuard() {
    let currentId = 0;
    let controller = null;

    return {
      start() {
        controller?.abort();
        controller = new AbortController();
        return { id: ++currentId, signal: controller.signal };
      },
      isCurrent(request) {
        return request.id === currentId;
      },
      hasActive() {
        return controller !== null;
      },
      finish(request) {
        if (request.id !== currentId) return false;
        controller = null;
        return true;
      },
      cancel() {
        currentId += 1;
        controller?.abort();
        controller = null;
      },
    };
  }

  root.createRequestGuard = createRequestGuard;
  if (typeof module !== 'undefined') module.exports = { createRequestGuard };
}(typeof window === 'undefined' ? globalThis : window));
