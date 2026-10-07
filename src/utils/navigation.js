function homeForRole(role) {
  if (role === 'ADMIN') return '/dashboard';
  if (role === 'ASISTENTE') return '/asistente/nueva-planilla';
  if (role === 'CONTABILIDAD') return '/contabilidad/planillas';
  return '/login';
}

function safeReturnTo(value, allowedPaths, fallback) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;

  try {
    const url = new URL(value, 'http://planilla.local');
    if (url.origin !== 'http://planilla.local' || !allowedPaths.includes(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

module.exports = { homeForRole, safeReturnTo };
