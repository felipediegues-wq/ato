/* Bate ponto no Supabase para o projeto gratuito não ser pausado.

   Lê a URL e a chave do próprio config.js, para não existirem dois lugares
   com os mesmos valores — se você trocar de projeto, troca num lugar só.

   Roda no GitHub Actions, uma vez por dia. Não precisa de segredo nenhum
   guardado no GitHub: a função bater_ponto() só grava um carimbo de tempo
   numa tabela própria, no máximo uma vez a cada 5 minutos.               */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'config.js'), 'utf8');

const window = {};
eval(src);                                   // define window.ATO
const { SUPABASE_URL, SUPABASE_ANON } = window.ATO || {};

if (!SUPABASE_URL || SUPABASE_URL.includes('SEUPROJETO')) {
  console.error('config.js ainda está com a URL de exemplo.');
  process.exit(1);
}

(async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bater_ponto`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_origem: 'github-actions' }),
  });

  const txt = await r.text();
  if (!r.ok) {
    console.error(`falhou: HTTP ${r.status} — ${txt}`);
    /* Sair com erro faz o GitHub mandar e-mail. Se o projeto tiver sido
       pausado mesmo assim, é assim que você fica sabendo.               */
    process.exit(1);
  }
  console.log('ok:', txt);
})();

