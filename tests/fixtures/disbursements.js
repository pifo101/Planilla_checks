const dorcas = [
  {
    DescripcionFormaDesembolso: 'Abono a prestamo',
    Ejecutado: true,
    FormaDesembolso: 3,
    Gasto01: 0,
    Gasto02: 0,
    Gasto03: 0,
    Gasto04: 0,
    Gasto05: 0,
    Gasto06: 0,
    Gasto07: 0,
    Gasto08: 0,
    Gasto09: 0,
    Gasto10: 0,
    NombreEnCheque: 'DORCAS ARACELY BUCH CUÁ DE MICULAX',
    NumeroCredito: '0010060111000003328',
    OrdenPago: 0,
    ValorNeto: 6476.33,
  },
  {
    DescripcionFormaDesembolso: 'Emision de cheque',
    Ejecutado: true,
    FormaDesembolso: 1,
    Gasto01: 600,
    Gasto02: 0,
    Gasto03: 0,
    Gasto04: 0,
    Gasto05: 0,
    Gasto06: 0,
    Gasto07: 0,
    Gasto08: 0,
    Gasto09: 0,
    Gasto10: 0,
    NombreEnCheque: 'DORCAS ARACELY BUCH CUÁ DE MICULAX',
    NumeroCredito: '',
    OrdenPago: 13582,
    ValorNeto: 4923.67,
  },
];

function knownDistribution({ cliente, montoCancelado, descuentos, montoCheque, numeroCredito, ordenPago }) {
  return [
    {
      DescripcionFormaDesembolso: 'Emision de cheque',
      Ejecutado: true,
      FormaDesembolso: 1,
      Gasto01: descuentos,
      Gasto02: 0,
      Gasto03: 0,
      Gasto04: 0,
      Gasto05: 0,
      Gasto06: 0,
      Gasto07: 0,
      Gasto08: 0,
      Gasto09: 0,
      Gasto10: 0,
      NombreEnCheque: cliente,
      OrdenPago: ordenPago,
      ValorNeto: montoCheque,
    },
    {
      DescripcionFormaDesembolso: 'Abono a prestamo',
      Ejecutado: true,
      FormaDesembolso: 3,
      Gasto01: 0,
      Gasto02: 0,
      Gasto03: 0,
      Gasto04: 0,
      Gasto05: 0,
      Gasto06: 0,
      Gasto07: 0,
      Gasto08: 0,
      Gasto09: 0,
      Gasto10: 0,
      NombreEnCheque: cliente,
      NumeroCredito: numeroCredito,
      ValorNeto: montoCancelado,
    },
  ];
}

const isabela = knownDistribution({
  cliente: 'ISABELA CHOVÓN TZEP',
  montoCancelado: 18738.87,
  descuentos: 9200,
  montoCheque: 156061.13,
  numeroCredito: '0010020111132073631',
  ordenPago: 13346,
});

const catarina = knownDistribution({
  cliente: 'CATARINA',
  montoCancelado: 3359.96,
  descuentos: 1250,
  montoCheque: 20390.04,
  numeroCredito: 'FIXTURE-CATARINA',
  ordenPago: 1,
});

const vicente = knownDistribution({
  cliente: 'VICENTE',
  montoCancelado: 958.93,
  descuentos: 250,
  montoCheque: 3791.07,
  numeroCredito: 'FIXTURE-VICENTE',
  ordenPago: 2,
});

const onlyLoanPayment = [
  {
    DescripcionFormaDesembolso: 'Abono a prestamo',
    Ejecutado: true,
    FormaDesembolso: 3,
    Gasto01: 6250,
    Gasto02: 0,
    Gasto03: 0,
    Gasto04: 0,
    Gasto05: 0,
    Gasto06: 0,
    Gasto07: 0,
    Gasto08: 0,
    Gasto09: 0,
    Gasto10: 0,
    NombreEnCheque: 'DIEGO JAVIER MÁS COTIY',
    NumeroCredito: '0010040111078874904',
    ValorNeto: 118750,
  },
];

module.exports = {
  dorcas,
  isabela,
  catarina,
  vicente,
  onlyLoanPayment,
};
