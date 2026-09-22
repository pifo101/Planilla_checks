function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calcularMontoAprobado({
  descuentos = 0,
  montoCheque = 0,
  montoCancelado = 0,
  tieneCancelacion = false,
} = {}) {
  const total = toNumber(descuentos) + toNumber(montoCheque);

  return tieneCancelacion ? total + toNumber(montoCancelado) : total;
}

module.exports = {
  calcularMontoAprobado,
};
