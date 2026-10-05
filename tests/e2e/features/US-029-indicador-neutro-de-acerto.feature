# language: pt
Funcionalidade: Indicador neutro de acerto na Home

  Contexto:
    Dado a família do indicador de acerto com Mariana e Lucas e hoje 12/10/2026

  Cenário: Indicador mostra o valor a acertar sem a palavra deve
    Dado uma diferença do indicador de "R$ 380,00" em outubro de 2026
    Quando Lucas abre a Home do indicador
    Então o Resumo mostra a linha "Acerto do mês: R$ 380,00 a acertar" sem a palavra "deve"
    E a Home não tem um card separado "Acerto do mês"

  Cenário: Mês equilibrado
    Dado despesas iguais pagas por cada membro em outubro de 2026
    Quando Lucas abre a Home do indicador
    Então o Resumo mostra a linha "Acerto do mês: em dia"

  Cenário: Mês sem despesas comuns oculta a linha
    Quando Lucas abre a Home do indicador
    Então o Resumo não mostra nenhuma linha de acerto

  Cenário: Tocar no indicador abre o painel do mês
    Dado uma diferença do indicador de "R$ 380,00" em outubro de 2026
    Quando Lucas abre a Home do indicador
    E Lucas toca na linha de acerto do mês
    Então Lucas vê o painel de Acerto de "2026-10"

  Cenário: Dívida de mês anterior leva ao mês pendente mais antigo
    Dado uma diferença do indicador de "R$ 260,50" em setembro de 2026
    Quando Lucas abre a Home do indicador
    Então o Resumo mostra a linha "Acertos pendentes de meses anteriores: 1 mês (R$ 260,50)" sem a palavra "deve"
    Quando Lucas toca no aviso de meses anteriores
    Então Lucas vê o painel de Acerto de "2026-09"

  Cenário: Mês anterior fora da janela de 12 meses não gera aviso
    Dado uma diferença do indicador de "R$ 90,00" em maio de 2025
    Quando Lucas abre a Home do indicador
    Então o Resumo não mostra o aviso de meses anteriores

  Cenário: Acerto desligado remove o indicador
    Dado uma diferença do indicador de "R$ 380,00" em outubro de 2026
    E o acerto está desligado na família do indicador
    Quando Lucas abre a Home do indicador
    Então o Resumo não mostra nenhuma linha de acerto
