const individualWithLoanPayment = [
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
    NombreEnCheque: 'CLIENTE PRUEBA UNO',
    NumeroCredito: 'TEST-CREDITO-001',
    OrdenPago: 0,
    ValorNeto: 100,
  },
  {
    DescripcionFormaDesembolso: 'Emision de cheque',
    Ejecutado: true,
    FormaDesembolso: 1,
    Gasto01: 25,
    Gasto02: 0,
    Gasto03: 0,
    Gasto04: 0,
    Gasto05: 0,
    Gasto06: 0,
    Gasto07: 0,
    Gasto08: 0,
    Gasto09: 0,
    Gasto10: 0,
    NombreEnCheque: 'CLIENTE PRUEBA UNO',
    NumeroCredito: '',
    OrdenPago: 10001,
    ValorNeto: 875,
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

const individualSmallDisbursement = knownDistribution({
  cliente: 'CLIENTE PRUEBA DOS',
  montoCancelado: 200,
  descuentos: 50,
  montoCheque: 1750,
  numeroCredito: 'TEST-CREDITO-002',
  ordenPago: 10002,
});

const individualStandardDisbursement = knownDistribution({
  cliente: 'CLIENTE PRUEBA TRES',
  montoCancelado: 300,
  descuentos: 75,
  montoCheque: 2625,
  numeroCredito: 'TEST-CREDITO-003',
  ordenPago: 10003,
});

const individualLargeDisbursement = knownDistribution({
  cliente: 'CLIENTE PRUEBA CUATRO',
  montoCancelado: 400,
  descuentos: 100,
  montoCheque: 3500,
  numeroCredito: 'TEST-CREDITO-004',
  ordenPago: 10004,
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
    NombreEnCheque: 'CLIENTE PRUEBA CINCO',
    NumeroCredito: 'TEST-CREDITO-005',
    ValorNeto: 5000,
  },
];

module.exports = {
  individualWithLoanPayment,
  individualSmallDisbursement,
  individualStandardDisbursement,
  individualLargeDisbursement,
  onlyLoanPayment,
};
