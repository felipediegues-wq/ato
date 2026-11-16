# Batimento — manter o Supabase acordado

O plano gratuito pausa um projeto que fica cerca de uma semana sem movimento
no banco. Enquanto o ESP32 ainda está em teste, isso é risco real.

## O que entra

| Arquivo | O que faz |
|---|---|
| `sql/30-batimento.sql` | tabela e função `bater_ponto()` |
| `index.html`, `app.js`, `config.js` | a página passa a bater enquanto estiver aberta |
| `.github/bater.js` + `workflows/manter-acordado.yml` | bate uma vez por dia, sozinho |

## Ordem

1. Rode `sql/30-batimento.sql` no SQL Editor do Supabase.
2. Suba os 4 arquivos da raiz por cima dos que já estão no repositório.
   **Guarde a URL e a chave que você já preencheu no `config.js`** — o deste
   pacote vem com os valores de exemplo.
3. Suba a pasta `.github/` inteira.
4. No GitHub, aba **Actions**, o fluxo "Manter o Supabase acordado" aparece.
   Clique nele e em **Run workflow** para testar na hora, sem esperar o dia
   seguinte.

## Por que são dois

A página só roda quando está aberta — se você não abrir por uma semana, ela
não salva nada. Quem garante o batimento com tudo fechado é o GitHub Actions.
A parte da página é conveniência: mostra no rodapé que o banco está vivo.

## O que a função permite, e por quê

`bater_ponto()` pode ser chamada **sem token**, de propósito. O que um
estranho conseguiria:

- gravar um carimbo de tempo numa tabela que não serve para mais nada
- no máximo uma vez a cada 5 minutos (trava de ritmo)
- sem ler nada, porque ler exige login
- sem fazer a tabela crescer, porque ela se poda em 200 linhas

Em troca, o GitHub Actions não precisa guardar segredo nenhum. A tabela do
aquário continua intocada: só o ESP32 grava nela, com o `SB_TOKEN`.

## Um aviso sobre o agendamento

O GitHub desativa agendamentos em repositório público que fica ~60 dias sem
commits, e avisa por e-mail antes. Se acontecer, abra a aba Actions e
reative num clique.
