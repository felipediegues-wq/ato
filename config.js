/* ============================================================================
   ATO — configuração do painel web

   Preencha os dois primeiros campos com os dados do SEU projeto Supabase,
   em Project Settings -> API.

   A chave aqui é a "anon" (public), e ela VAI aparecer no navegador de quem
   abrir a página — é assim que funciona qualquer página estática. Isso não
   é problema porque, depois do 10-seguranca.sql, a chave anon sozinha não
   lê nem escreve nada: só serve para o Supabase saber de qual projeto se
   trata e para o fluxo de login.

   NUNCA ponha aqui a chave "service_role", nem o SB_TOKEN do ESP32.
   ============================================================================ */
window.ATO = {

  SUPABASE_URL:  'https://iwksmzabenvdoijeywwl.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3a3NtemFiZW52ZG9pamV5d3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjM2MjYsImV4cCI6MjEwNjUzOTYyNn0.dzO1vH7dVClC2ejVTtyRPJgoN-WXsN5ci6nRe-ydumo',

  /* Nome mostrado no topo. */
  TITULO: 'Aquário 72 L',

  /* ---- limiares do sump, só para desenhar as marcas ----
     Use os mesmos valores que estão na página do ATO, aba Nível. Eles não
     mandam em nada: só servem para o desenho mostrar onde a bomba liga e
     desliga.                                                              */
  NIVEL_LIGA:    40,
  NIVEL_DESLIGA: 60,
  NIVEL_HH:      90,

  /* ---- faixa boa de cada leitura ---- */
  TEMP_ALVO:   25.5,
  TEMP_MIN:    24.5,
  TEMP_MAX:    27.0,
  PH_MIN:      7.80,
  PH_MAX:      8.50,

  /* Vazão de referência com o rotor limpo, em L/h. Deixe igual à que você
     gravou na aba Água do ATO.                                            */
  VAZAO_REF:   900,

  /* ---- quando considerar que o ESP32 sumiu ----
     O firmware grava a cada 5 minutos. Um atraso de 12 minutos já significa
     duas amostras perdidas.                                               */
  ATRASO_AVISO:  12,   // minutos — fica amarelo
  ATRASO_GRAVE:  30,   // minutos — fica vermelho e avisa alto

  /* De quanto em quanto tempo a página se atualiza sozinha, em segundos. */
  RECARGA: 60,

  /* ---- batimento ----
     Enquanto esta página estiver aberta, ela grava um carimbo de tempo no
     banco de tempos em tempos. Serve para o projeto gratuito do Supabase não
     ser pausado por inatividade.

     Atenção: isto só funciona com a página ABERTA. Quem garante o batimento
     com tudo fechado é o GitHub Actions — veja .github/workflows/.

     0 desliga.                                                           */
  BATIMENTO_MIN: 10
};
