const OPERATIONAL_TIME_ZONE = 'America/Guatemala';
const GUATEMALA_UTC_OFFSET = '-06:00';

const operationalDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OPERATIONAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function requireValidDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Se requiere una fecha valida.');
  }
  return value;
}

function getOperationalDate(now = new Date()) {
  const parts = operationalDateFormatter.formatToParts(requireValidDate(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toSecondPrecision(value) {
  const date = requireValidDate(value);
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function getOperationalDateRange(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01') {
    throw new TypeError('Se requiere una fecha operativa valida.');
  }
  const startDate = new Date(`${date}T00:00:00${GUATEMALA_UTC_OFFSET}`);
  if (Number.isNaN(startDate.getTime()) || getOperationalDate(startDate) !== date) {
    throw new TypeError('Se requiere una fecha operativa valida.');
  }
  return {
    startDate,
    endDate: new Date(startDate.getTime() + (24 * 60 * 60 * 1000)),
  };
}

module.exports = {
  OPERATIONAL_TIME_ZONE,
  getOperationalDate,
  getOperationalDateRange,
  toSecondPrecision,
};
