# EN-005 — Opt-in de privacidade por família para recursos de IA (Habilitadora)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 Entrada de Dados e Análise por IA · **R4-B (proposta)**, antes do primeiro envio real a LLM |
| Tipo | **Habilitadora** com tela mínima em "Configurações ▸ IA e privacidade" |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Must · 2,6 · 5 |
| Status | Implementada (TASK-058, aguardando validação do Gestor) |
| Depende de | US-031/035 (papéis da família), EN-004 (para exibir o consumo) |
| Corte | Não cortar (RN16: sem opt-in não há envio) |
| Rastreabilidade | NEED-026 (§4, Q-U07), NEED-027 (RN-027.1, RN-027.8), NEED-023 (RN-023.1) · RN15, RN16 · FLUXO-016 · D-PO-58 |

## Justificativa
Qualquer recurso que envie dado financeiro à Anthropic exige consentimento **da família**, explícito, informado e revogável (RN16). É decisão única e comum às histórias US-066..073; por isso fica aqui.

## Regras
- **Desligado por padrão**; só o **Administrador** liga/desliga.
- **Um interruptor por finalidade**: "Importar faturas" e "Análise de gastos"; cada um com texto próprio do que é enviado (D-PO-58).
- O texto de consentimento é **versionado**: se mudar, o consentimento anterior é invalidado e o Administrador confirma de novo. Registra-se quem ligou e quando.
- Desligar tem efeito imediato e **não apaga** o que já foi importado (apaga-se o histórico de análise pela US-073).
- Membros veem o estado ("A importação de faturas por IA está ligada/desligada") e, se desligada, a explicação de quem pode ligar.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Opt-in de privacidade para IA

  Contexto:
    Dado a "Família Silva" com "Mariana" como Administradora e "Lucas" como membro
    E os recursos de IA desligados

  Cenário: Recursos de IA nascem desligados
    Quando Mariana abre "Configurações" e "IA e privacidade"
    Então os interruptores "Importar faturas" e "Análise de gastos" estão desligados

  Cenário: Ligar exige ler e confirmar o que é enviado
    Dado que Mariana abre "IA e privacidade"
    Quando Mariana liga "Importar faturas"
    Então vê o texto "O arquivo da fatura é enviado à Anthropic para leitura e depois descartado"
    E vê o botão "Entendi e quero ligar"
    E o recurso só liga depois de Mariana tocar em "Entendi e quero ligar"

  Cenário: Consentimento registra quem e quando
    Dado que Mariana liga "Importar faturas" e confirma
    Quando Mariana abre o detalhe do consentimento
    Então vê "Ligado por Mariana em 24/10/2026"

  Cenário: Membro comum não altera
    Dado que Lucas abre "Configurações" e "IA e privacidade"
    Então vê os interruptores desabilitados
    E vê "Só o Administrador pode ligar ou desligar"

  Cenário: Recurso desligado bloqueia o envio
    Dado que "Importar faturas" está desligado
    Quando Lucas tenta importar uma fatura
    Então vê "A importação por IA está desligada nesta família"
    E nenhum arquivo é enviado

  Cenário: Desligar vale na hora e não apaga dados
    Dado que "Importar faturas" está ligado e há uma fatura já importada
    Quando Mariana desliga "Importar faturas"
    Então os lançamentos importados continuam no Extrato
    E novas importações ficam bloqueadas

  Cenário: Mudança no texto exige novo consentimento
    Dado que "Análise de gastos" foi ligada com a versão 1 do texto
    Quando a versão 2 do texto de consentimento é publicada
    Então "Análise de gastos" fica desligada até Mariana confirmar de novo
```

## Fora de escopo
Consentimento individual por membro; opt-in do MCP (é por membro, US-074); anonimização avançada.

## Histórico
- 2026-10-24 — Criada (D-PO-58).
