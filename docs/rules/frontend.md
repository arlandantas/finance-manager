# Regras: frontend (Next.js)

- Este Next.js tem breaking changes: em dúvida de API/convenção, confirme em `node_modules/next/dist/docs/` antes de codar.
- Mobile-first: funciona a 375px sem rolagem horizontal; alvos de toque ≥ 44px.
- A11y: rótulos em todo campo, foco visível, `aria-*` em diálogos/abas, contraste AA, navegação por teclado.
- Toda tela com dados tem estados loading (skeleton), erro (mensagem + tentar de novo) e vazio (orientação).
- Após mutação, invalide as chaves React Query afetadas (lista, totais, saldos, resumo); nada de refetch manual ad hoc.
- UI não calcula regra financeira: usa valores do servidor; formata centavos só na exibição.
- Textos em pt-BR; erros da API mapeados para mensagem amigável, sem expor código/stack.
- Lint e formatação com Biome: `pnpm lint` (e `pnpm lint:fix`) e `pnpm typecheck` limpos antes de concluir.
