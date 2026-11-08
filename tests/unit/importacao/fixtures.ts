// Fixtures SINTÉTICAS (formatos públicos de 5 bancos; nenhum dado real). Todas geram os mesmos 3 itens.
export const EXPECTED = [
  {
    date: "2026-10-03",
    description: "MERCADO BOM PRECO",
    amountInCents: 123456n,
    kind: "PURCHASE",
    installment: null,
  },
  {
    date: "2026-10-05",
    description: "LOJA DE ROUPAS",
    amountInCents: 5000n,
    kind: "PURCHASE",
    installment: { no: 3, count: 10 },
  },
  {
    date: "2026-10-07",
    description: "ESTORNO PADARIA",
    amountInCents: 1000n,
    kind: "CREDIT",
    installment: null,
  },
] as const;

const latin1 = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));
const utf8 = (s: string) => Uint8Array.from(Buffer.from(s, "utf8"));

export const FIXTURES: Record<string, { bytes: Uint8Array; ref: string }> = {
  nubank: {
    ref: "2026-10",
    bytes: utf8(
      'date,category,title,amount\n2026-10-03,casa,"MERCADO BOM PRECO",1234.56\n2026-10-05,moda,LOJA DE ROUPAS 03/10,50.00\n2026-10-07,x,ESTORNO PADARIA,-10.00\n',
    ),
  },
  itau: {
    ref: "2026-10",
    bytes: latin1(
      "Data;Histórico;Valor\n03/10/2026;MERCADO BOM PRECO;1.234,56\n05/10/2026;LOJA DE ROUPAS PARC 03/10;50,00\n07/10/2026;ESTORNO PADARIA;-10,00\n",
    ),
  },
  bradesco: {
    ref: "2026-10",
    bytes: utf8(
      "Linha preliminar do extrato\nData;Histórico;Valor (R$)\n03/10;MERCADO BOM PRECO;1.234,56\n05/10;LOJA DE ROUPAS 03/10;50,00\n07/10;ESTORNO PADARIA;-10,00\n\n;Total;1.274,56\n",
    ),
  },
  inter: {
    ref: "2026-10",
    bytes: utf8(
      '﻿"Data","Descrição","Valor"\n"03/10/2026","MERCADO BOM PRECO","1.234,56"\n"05/10/2026","LOJA DE ROUPAS 03/10","50,00"\n"07/10/2026","ESTORNO PADARIA","-10,00"\r\n',
    ),
  },
  c6: {
    ref: "2026-10",
    bytes: latin1(
      "Data de Compra;Estabelecimento;Valor\r\n2026-10-03;MERCADO BOM PRECO;1234.56\r\n2026-10-05;LOJA DE ROUPAS - 03/10;50.00\r\n2026-10-07;ESTORNO PADARIA;-10.00\r\n",
    ),
  },
};
