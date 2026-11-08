# Backlog
Uma linha por história/enabler. Status: `todo` · `doing` · `done` · `blocked`. Detalhe das pendentes: `stories/US-NNN.md`.
Ordem = ordem de execução; as entregues vêm primeiro. Status conferido contra código e testes em 2026-11-02.
Pendentes: `todo` (pode iniciar quando as deps fecharem) · `blocked` (nenhuma hoje).
Ordem das pendentes (importação de fatura, ADR-042, spec 13): US-066 → US-066b → US-066c → US-067 → US-068 → US-067b → US-069.

| ID | Marco | Título | Status | Deps |
|---|---|---|---|---|
| EN-001 | M0 | Ambiente local e esqueleto da aplicação (Enabler) | done | — |
| US-001 | R1 | Entrar com a conta Google | done | EN-001 |
| US-002 | R1 | Criar a família no primeiro acesso | done | US-001 |
| US-004 | R1 | Cadastrar conta bancária com saldo inicial | done | US-002 |
| US-005 | R1 | Lançar uma despesa rapidamente | done | US-004 |
| US-006 | R1 | Lançar uma receita | done | US-005 |
| US-007 | R1 | Consultar o extrato de lançamentos com filtros | done | US-005, US-006 |
| US-003 | R1 | Convidar membro por e-mail | done | US-002 |
| US-008 | R1 | Definir a regra de divisão das despesas comuns | done | US-003 |
| US-009a | R1 | Acerto de contas: motor e painel essencial | done | US-005, US-008 |
| US-010 | R1 | Transferir dinheiro entre contas da família | done | US-004 |
| US-011 | R1 | Registrar o acerto de contas como transferência | done | US-009a, US-010 |
| US-012 | R1 | Home: visão essencial da família | done | US-004, US-007, US-009a |
| US-009b | R1 | Acerto: 3+ membros e detalhe das despesas | done | US-009a |
| US-013a | R1 | Corrigir, excluir e restaurar lançamento | done | US-005, US-007, US-009a |
| US-013b | R1 | Desfazer transferência/acerto e aviso de mês acertado | done | US-013a, US-010, US-011 |
| US-015 | R2 | Cadastrar cartão de crédito | done | US-002 |
| US-016a | R2 | Compra à vista no cartão | done | US-015, US-005 |
| US-017a | R2 | Ver a fatura do cartão e o limite | done | US-016a |
| US-018 | R2 | Cadastrar uma despesa prevista | done | US-005, US-012 |
| US-019 | R2 | Dar baixa em uma despesa prevista | done | US-018, US-004 |
| US-017b | R2 | Pagar a fatura | done | US-017a, US-004, US-010 |
| US-016b | R2 | Corrigir compra no cartão e filtrar por cartão | done | US-016a, US-013a |
| US-014 | R2 | Gerenciar categorias da família | done | US-002, US-005 |
| US-027 | R2.1 | Ocultar valores na tela | done | — |
| US-022 | R2.1 | Rótulo honesto da regra de divisão no Acerto | done | US-008, US-009a |
| US-023 | R2.1 | Conta de origem padrão inteligente nos pagamentos | done | US-017b, US-019 |
| US-024 | R2.1 | Descrição visível e opcional ao lançar | done | US-005, US-006, US-016a |
| US-025 | R2.1 | Resumo do Mês como foco da Home | done | US-012, US-017a, US-018, US-027 |
| US-026 | R2.1 | Saldos das contas em card recolhível | done | US-025, US-004 |
| US-028 | R2.1 | Acerto de contas opcional por família | done | US-009a, US-011, US-012 |
| US-029 | R2.1 | Indicador neutro de acerto na Home e aviso de dívida de mês anterior | done | US-028, US-025 |
| US-030 | R2.1 | "Dividir com a família" desligado por padrão ("Só meu") | done | US-028, US-005, US-018 |
| US-031 | R2.1 | Prévia de impacto ao trocar a regra e sugestão pela renda | done | US-008, US-022 |
| US-032 | R2.1 | Arquivar, reativar e excluir conta bancária | done | US-004, US-010 |
| US-033 | R2.1 | Arquivar e reativar cartão de crédito | done | US-015, US-017a, US-032 |
| US-034 | R2.1 | Editar a família e alterar papéis dos membros | done | US-002, US-003 |
| US-035 | R2.1 | Remover membro e sair da família | done | US-034, US-032 |
| US-036 | R2.1 | Detalhe da transação a partir da Home | done | US-012, US-013a, US-007 |
| US-037 | R2.1 | Tema claro e escuro | done | US-027 |
| US-038 | R2.1 | Navegação no desktop com conteúdo contido | done | US-037 |
| US-039 | R2.1 | Polimento da homologação | done | US-003, US-007, US-014 |
| US-052 | R2.2 | Aviso visível: compra parcelada ainda fica fora do acerto | done | US-040a, US-030, US-029 |
| US-055 | R2.2 | Faturas de cartão na tela "A pagar" | done | US-017a, US-018, US-019, US-025 |
| US-054 | R2.2 | Avisar antes de arquivar cartão e botão flutuante que não cobre ações em Contas | done | US-032, US-033, US-039 |
| US-053 | R2.2 | Clareza de textos: acerto desligado, regra somente leitura e preferência do olho | done | US-028, US-031, US-027, US-036 |
| US-056 | R2.2 | Polimento: modal de confirmação sobreposto e contraste de estados nos dois temas | done | — |
| US-057 | R2.2 | Conta fora do saldo disponível (reserva) | done | US-032, US-026 |
| US-058 | R2.2 | Despesa recorrente mensal (gera previstas) | done | US-018, US-019 |
| US-059 | R2.2 | Conta de pagamento na despesa prevista | done | US-018, US-019 |
| US-061 | R2.2 | Início enxuta: ações rápidas, vence em breve, extrato recente | done | US-055, US-058, US-059 |
| US-062 | R2.2 | Filtros do Extrato fechados por padrão e "Limpar filtros" | done | US-007 |
| US-063 | R2.2 | Resumo do Mês: rótulo "Previstas" e hierarquia de Despesas | done | US-025, US-055 |
| US-064 | R2.2 | Menu lateral no desktop (ajuste da US-038) | done | US-038, US-056 |
| US-040a | R3 | Compra parcelada atômica no cartão | done | US-016a, US-017a, US-024 |
| US-040b | R3 | Excluir compra parcelada inteira e Extrato por intervalo | done | US-040a |
| EN-002a | R3 | Percentual gravado por lançamento: motor STORED | done | US-040a |
| EN-002b | R3 | Percentual gravado: migração com gate de 1 centavo | done | EN-002a |
| US-043 | R3 | Dividir no lançamento: Só meu, Pela regra ou De outro jeito | done | EN-002, US-030 |
| US-041 | R3 | Gerenciar compra parcelada (editar parcelas e excluir uma parcela) | done | US-040, US-016b, US-043 |
| US-042 | R3 | Compra parcelada dividida entra no acerto por parcela | done | US-040, EN-002, US-030, US-041 |
| US-044 | R3 | Lembrar "dividir" por categoria e revisar despesas não divididas no fechamento | done | US-043, US-014 |
| US-045 | R3 | Tags livres no lançamento | done | US-005, US-006, US-016a, US-024 |
| US-047 | R3 | Filtrar o Extrato por tag | done | US-045, US-007 |
| US-046 | R3 | Gerenciar tags (listar, renomear, remover) | done | US-045 |
| US-048 | R3 | Visão sintética: período, totais e quebra por categoria | done | US-007, US-025, US-040b |
| US-049 | R3 | Visão sintética: quebras por membro, conta/cartão e tag, com filtros combináveis | done | US-048, US-045, US-047 |
| US-050 | R3 | Cor por conta e cartão | done | US-004, US-015, US-037 |
| US-051 | R3 | Receitas previstas e saldo previsto completo | done | US-018, US-019, US-025 |
| EN-003 | R3 | Spike de modelo: uma pessoa em mais de um grupo | done | — |
| US-065 | R4-A | Compra parcelada com parcelas já pagas | done | US-040a, US-040b |
| EN-004 | R4-B | Infra de LLM: chave Anthropic do app, cliente único e teto de custo | done | — |
| EN-005 | R4-B | Opt-in de privacidade por família para recursos de IA (Habilitadora) | done | EN-004 |
| EN-006 | R4 | SMTP real com autenticação e TLS (Habilitadora) | done | — |
| US-066 | R4-B | Importação: enviar o CSV e extrair os itens (servidor, flag) | done | EN-004, EN-005 |
| US-066b | R4-B | Importação: texto do PDF, linhas candidatas e anonimização (pré-visualização) | done | US-066 |
| US-066c | R4-B | Importação: extrair o PDF pela IA (consentimento próprio, provedor simulado) | done | US-066b, EN-004, EN-005 |
| US-067 | R4-B | Importação: rascunho revisável (grupos, categoria, duplicados, total) e migração | done | US-066 |
| US-068 | R4-B | Importação: confirmar e gravar o lote (atômico, idempotente, sem duplicar) | done | US-067 |
| US-067b | R4-B | Importação: telas de envio, revisão e confirmação | done | US-066c, US-067, US-068 |
| US-069 | R4-B | Importação: listar e desfazer um lote importado | done | US-068, US-067b |
| US-070 | R4-C | Análise de gastos por IA: o que pode ser evitado | done | EN-004, EN-005, US-048 |
| US-071 | R4-C | Descartar uma sugestão ("este gasto é importante para nós") | done | US-070 |
| US-072 | R4-C | Aceitar, uma a uma, as sugestões de recategorização | done | US-070 |
| US-073 | R4-C | Histórico das análises e apagar o que foi enviado | done | US-070 |
| EN-007 | R4-D | Hospedagem de produção: Vercel + Prisma Postgres (Habilitadora) | done | — |
| EN-006a | R4-D | Servidor MCP: OAuth próprio (POC) | done | EN-007 |
| EN-006b | R4-D | Servidor MCP: endpoint, contexto, taxa e auditoria | done | EN-006a |
| US-074 | R4-D | Conectar, ver e revogar o acesso do meu assistente de IA | done | EN-006b |
| US-075 | R4-D | Consultar saldos, gastos e extrato pelo assistente (somente leitura) | done | US-074 |
| US-077 | R4-D | Ver o que o meu assistente leu e lançou (auditoria) | done | EN-006b, US-074 |
| US-076a | R4-D | Lançar uma despesa direto pelo assistente | done | US-075, US-077, EN-007 |
| US-076b | R4-D | Limites de lançamento do assistente, configuráveis pelo membro | done | US-076a |
| US-076c | R4-D | Modo opcional "exigir confirmação" por conexão | done | US-076a, US-076b |
| US-074b | R4-D | Token pessoal (PAT) para clientes MCP sem OAuth: servidor (ADR-043) | done | US-074, US-075, US-076b, US-076c |
| US-074c | R4-D | Token pessoal: tela, chave do Administrador e alerta de uso | done | US-074b |
| US-083 | R4-S | Cadastro restrito por lista de e-mails permitidos (alpha) | done | — |
| US-084 | R4-S | Lançamento "Só meu" só pode ser alterado por quem tem controle sobre ele | done | US-005, US-013a |
| US-078 | R4-S | Encerrar as outras sessões | done | — |
| US-082 | R4-S | Página "Privacidade" (dados tratados, retenção e direitos) | done | — |
| US-079 | R4-S | Baixar meus dados | done | — |
| US-080 | R4-S | Excluir minha conta | done | US-078, US-079, US-035 |
| US-081 | R4-S | Excluir a família | done | US-080 |
| US-060 | UR-1 | Resumo por conta na tela "A pagar" (saldo previsto por conta) | done | US-059, US-055, US-057 |
| US-085 | UR-1 | Seleção despesa x receita inequívoca em todo formulário | done | — |
| US-087 | UR-1 | Colunas do Extrato alinhadas entre as linhas | done | US-062, US-040b |
| US-086 | UR-1 | Espaçamento compacto e consistente nos formulários | done | — |
| US-088 | UR-1 | "Ver compra" como ação do próprio card da compra parcelada | done | US-040b, US-087 |
| US-089 | UR-1 | Conta pagadora padrão do cartão (sugerida ao pagar a fatura) | done | US-015, US-017b, US-033 |
| US-090 | UR-1 | Lançar ou prever na mesma porta ("Já aconteceu / Vai acontecer") | done | US-005, US-006, US-018, US-019, US-030 |
| US-091 | UR-1 | "Repetir todo mês" na mesma porta (série de previstas) | done | US-090, US-058, US-059 |
| US-092a | UR-2 | Membro sem conta: modelo e leitura | done | US-002, US-003, US-034, US-035 |
| US-092b | UR-2 | Cadastrar membro sem conta | done | US-092a |
| US-093a | UR-2 | Membro sem conta como titular, selo e acerto | done | US-092 |
| US-093b | UR-2 | Só meu, pagador/responsável e tutor do membro sem conta | done | US-093a, US-084 |
| US-094a | UR-2 | Convite vinculado ao membro cadastrado | done | US-092b, US-093b, US-003, US-035 |
| US-094b | UR-2 | Aceite do convite vinculado e herança do histórico | done | US-094a |
| US-095 | UR-2 | Editar o membro sem conta (nome e e-mail) | done | US-094a |
| US-096 | UR-2 | Assinatura no cartão: modelo, cadastro e lançamento automático (servidor) | done | US-016a, US-017a, US-058 |
| US-096b | UR-2 | Assinatura: lançamento ao abrir telas, arquivar cartão, remoção e exportação | done | US-096 |
| US-096c | UR-2 | Assinatura: telas do cartão, fatura e selo no Extrato | done | US-096, US-096b |
| US-096d | UR-2 | "Assinatura (todo mês)" na porta única com cartão | done | US-096c, US-091 |
| US-097 | UR-2 | Corrigir a cobrança do mês, reajustar e encerrar a assinatura | done | US-096c |
| US-098 | UR-2 | Lista de assinaturas e total mensal | done | US-097 |
| US-099 | UR-2 | Assinatura dividida entra no acerto | done | US-097, US-028, US-030 |
| US-100 | UR-2 | Transferência prevista: modelo, cadastro e efetivação (servidor) | done | US-060, US-010 |
| US-100b | UR-2 | Transferência prevista: telas, coluna no resumo por conta e arquivamento | done | US-100, US-054 |
| US-101 | UR-2 | Transferência prevista recorrente: série e geração (servidor) | done | US-100 |
| US-101b | UR-2 | Transferência recorrente: telas e arquivamento de conta | done | US-101, US-100b |
| US-102 | R4-S | Migrar runtime de Node 22 para 26 | done | — |
