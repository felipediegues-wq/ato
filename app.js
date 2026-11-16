/* ============================================================================
   ATO — painel web

   A página só lê. Nenhum comando sai daqui: para parar o sistema existem o
   Telegram e a página local do ATO, que falam direto com o ESP32. Um painel
   na nuvem acionando relé dependeria de banco, de internet e de três saltos
   de rede — e nada disso pode estar no caminho de uma decisão sobre a bomba.

   A leitura exige login. A chave anon que vai neste código não enxerga uma
   linha sequer sozinha; quem libera os dados é a sessão do usuário.
   ============================================================================ */
'use strict';

const C = window.ATO;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON);

const $ = (id) => document.getElementById(id);
const elEntrar = $('entrar'), elPainel = $('painel');

let graficos = [];      // instâncias do uPlot, para destruir ao trocar janela
let ciclos24 = null;    // quantas vezes a bomba ligou nas últimas 24 h
let horas = 24;
let timerRecarga = null;

/* ========================================================== entrada === */

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  mostrar(session);
  sb.auth.onAuthStateChange((_e, s) => mostrar(s));
}

function mostrar(session) {
  const dentro = !!session;
  elEntrar.hidden = dentro;
  elPainel.hidden = !dentro;
  if (dentro) {
    $('titulo').textContent = C.TITULO;
    document.title = C.TITULO;
    carregarTudo();
    clearInterval(timerRecarga);
    timerRecarga = setInterval(
      () => proteger(carregarAgora, 'leitura atual'),
      Math.max(C.RECARGA, 20) * 1000);
  } else {
    clearInterval(timerRecarga);
  }
}

$('form-entrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('email').value.trim();
  const msg = $('entrar-msg'), bt = $('bt-entrar');
  if (!email) return;

  bt.disabled = true;
  msg.className = 'msg';
  msg.textContent = 'enviando…';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('#')[0] }
  });

  bt.disabled = false;
  if (error) {
    msg.className = 'msg erro';
    /* O Supabase devolve a mesma mensagem para e-mail não cadastrado e para
       cadastro desligado. Como aqui o cadastro É desligado de propósito,
       vale explicar em vez de deixar o usuário achando que errou a digitação. */
    msg.textContent = /signups? not allowed|not authorized/i.test(error.message)
      ? 'Este e-mail não está autorizado. O cadastro é fechado: as contas são '
        + 'criadas à mão no painel do Supabase.'
      : 'Não deu para enviar: ' + error.message;
  } else {
    msg.className = 'msg ok';
    msg.textContent = 'Link enviado. Abra o e-mail neste mesmo aparelho — '
                    + 'o link só vale uma vez e expira em 1 hora.';
  }
});

$('bt-sair').addEventListener('click', () => sb.auth.signOut());

/* ========================================================== dados ===== */

/* Cada bloco carrega por conta própria. Se o gráfico quebrar - biblioteca
   que não baixou, dado estranho -, a leitura de agora e os alarmes têm de
   continuar aparecendo. Numa página de monitoramento, meia tela viva vale
   muito mais do que uma tela em branco.                                  */
async function carregarTudo() {
  await Promise.allSettled([
    proteger(carregarAgora,     'leitura atual'),
    proteger(carregarHistorico, 'histórico'),
    proteger(carregarAlarmes,   'alarmes'),
  ]);
}

async function proteger(fn, nome) {
  try { await fn(); }
  catch (e) {
    console.error('[ATO] falhou:', nome, e);
    if (nome === 'histórico') {
      const m = $('hist-msg');
      m.className = 'msg erro';
      m.textContent = 'Os gráficos não carregaram (' + e.message
                    + '). O resto da página continua válido.';
    }
  }
}

/** A última amostra: é ela que diz se o aquário está bem AGORA. */
async function carregarAgora() {
  const { data, error } = await sb
    .from('aquario')
    .select('*')
    .order('ts', { ascending: false })
    .limit(1);

  if (error) { avisar('Não deu para ler o banco: ' + error.message); return; }
  if (!data || !data.length) {
    avisar('Nenhuma amostra gravada ainda. Confira o LOG_DESTINO no firmware.');
    return;
  }
  desenharAgora(data[0]);
}

function desenharAgora(d) {
  const agora = new Date();
  const ts = new Date(d.ts);
  const min = Math.floor((agora - ts) / 60000);

  /* ---- contato: a coisa mais importante da página ---------------------
     Um painel que mostra número velho com cara de número novo é pior do
     que um painel apagado.                                              */
  const cont = $('contato'), txt = $('contato-txt');
  cont.className = 'contato ' +
    (min >= C.ATRASO_GRAVE ? 'grave' : min >= C.ATRASO_AVISO ? 'aviso' : 'bom');
  txt.textContent = min < 1 ? 'agora mesmo'
                  : min < 60 ? `há ${min} min`
                  : `há ${Math.floor(min / 60)} h ${min % 60} min`;

  if (min >= C.ATRASO_GRAVE) {
    avisar(`O ESP32 não grava há ${txt.textContent}. Os valores abaixo são `
         + `dessa hora, não de agora. Confira a energia, o Wi-Fi e a página `
         + `local do ATO.`);
  } else {
    esconderAviso();
  }

  /* ---- sump ---- */
  const n = num(d.nivel_pct);
  $('v-nivel').textContent = n === null ? '--' : n.toFixed(0);
  $('v-bruta').textContent = d.dist_mm ? `${d.dist_mm} mm até a água` : '';
  encherSump(n);
  marcasSump();

  $('v-liga').textContent    = C.NIVEL_LIGA + ' %';
  $('v-desliga').textContent = C.NIVEL_DESLIGA + ' %';
  /* "ciclos hoje" sai do próprio histórico de 24 h: é a soma das vezes em
     que a bomba passou de desligada para ligada.                        */
  if (ciclos24 !== null) $('v-ciclos').textContent = ciclos24;

  lamp('lamp-bomba', d.bomba, 'agua');
  $('bomba-txt').textContent = d.bomba ? 'repondo água' : 'bomba em repouso';

  /* ---- leituras ---- */
  leitura('temp', num(d.temp_c), C.TEMP_MIN, C.TEMP_MAX, 1,
          `alvo ${C.TEMP_ALVO} °C`);
  leitura('ph', num(d.ph), C.PH_MIN, C.PH_MAX, 2,
          `faixa ${C.PH_MIN.toFixed(2)} – ${C.PH_MAX.toFixed(2)}`);

  const v = num(d.vazao_lh);
  const pc = v === null ? null : Math.round(v * 100 / C.VAZAO_REF);
  leitura('vazao', v, C.VAZAO_REF * 0.8, C.VAZAO_REF * 1.3, 0,
          pc === null ? 'referência ' + C.VAZAO_REF + ' L/h'
                      : `${pc}% da referência de ${C.VAZAO_REF} L/h`);

  /* ---- lâmpadas ---- */
  lamp('lamp-aquec', d.aquecedor, 'cobre');
  lamp('lamp-vent',  d.ventilador, 'agua');
  lamp('lamp-hh',    d.boia_hh, 'verm');
  lamp('lamp-low',   d.boia_low, 'amarelo');
  const temAlarme = !!(d.alarme && d.alarme.trim());
  lamp('lamp-alm', temAlarme, 'verm');
  if (temAlarme) avisar('Alarme ativo: ' + d.alarme);

  $('rodape-atual').textContent = 'leitura de ' + ts.toLocaleString('pt-BR');
}

function num(x) {
  if (x === null || x === undefined || x === '') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function leitura(nome, valor, min, max, casas, nota) {
  const bloco = $('bl-' + nome);
  $('v-' + nome).textContent = valor === null ? '--' : valor.toFixed(casas);
  $('n-' + nome).textContent = nota;
  const fora = valor !== null && (valor < min || valor > max);
  bloco.classList.toggle('ruim', fora);

  const m = $('m-' + nome);
  if (valor === null) { m.style.left = '50%'; return; }
  /* A régua mostra 20% de folga além da faixa, para o ponto não grudar na
     borda quando a leitura passa do limite. */
  const folga = (max - min) * 0.2;
  const p = (valor - (min - folga)) / ((max + folga) - (min - folga));
  m.style.left = (Math.min(Math.max(p, 0), 1) * 100).toFixed(1) + '%';
  m.classList.toggle('fora', fora);
}

function lamp(id, ligado, cor) {
  const e = $(id);
  e.className = 'lamp' + (ligado ? ' on-' + cor : '');
}

function avisar(txt) {
  const a = $('aviso'); a.textContent = txt; a.hidden = false;
}
function esconderAviso() { $('aviso').hidden = true; }

/* -------------------------------------------------------- o desenho -- */

const CAIXA = { y: 20, h: 200 };    // igual ao viewBox do SVG

function encherSump(pct) {
  const g = $('g-agua');
  const p = pct === null ? 0 : Math.min(Math.max(pct, 0), 100);
  const desloca = CAIXA.h * (1 - p / 100);
  g.style.transition = 'transform .9s cubic-bezier(.22,.61,.36,1)';
  g.style.transform = `translateY(${desloca}px)`;

  /* uma ondinha na superfície — é água, afinal */
  const onda = $('onda');
  let d = `M 18 ${CAIXA.y}`;
  for (let x = 18; x <= 142; x += 8) {
    d += ` Q ${x + 2} ${CAIXA.y - 3} ${x + 4} ${CAIXA.y}`
       + ` Q ${x + 6} ${CAIXA.y + 3} ${x + 8} ${CAIXA.y}`;
  }
  d += ` L 142 ${CAIXA.y + 10} L 18 ${CAIXA.y + 10} Z`;
  onda.setAttribute('d', d);
}

function marcasSump() {
  const g = $('marcas');
  if (g.dataset.pronto) return;
  g.dataset.pronto = '1';
  const y = (p) => CAIXA.y + CAIXA.h * (1 - p / 100);
  const marca = (p, rot, cls) => {
    const gg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (cls) gg.setAttribute('class', cls);
    gg.innerHTML =
      `<line x1="18" y1="${y(p)}" x2="142" y2="${y(p)}"/>` +
      `<text x="146" y="${y(p) + 3}">${rot}</text>`;
    g.appendChild(gg);
  };
  marca(C.NIVEL_HH, 'HH', 'hh');
  marca(C.NIVEL_DESLIGA, 'desl');
  marca(C.NIVEL_LIGA, 'liga');
}

/* ====================================================== histórico ===== */

document.querySelectorAll('.janelas button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.janelas button')
            .forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    horas = Number(b.dataset.h);
    carregarHistorico();
  });
});

/** Rótulos do eixo do tempo.

    Em janela curta, hora. Em janela longa, a data — mas só na primeira marca
    de cada dia: com duas marcas por dia, repetir "12/11 12/11" lado a lado
    não informa nada e ainda polui a leitura. As demais ficam em branco, que
    mantém a grade sem repetir texto.                                      */
function rotulosEixo(splits) {
  if (horas <= 48) {
    return splits.map((seg) => new Date(seg * 1000)
      .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  }
  let anterior = null;
  return splits.map((seg) => {
    const dia = new Date(seg * 1000)
      .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (dia === anterior) return '';
    anterior = dia;
    return dia;
  });
}

const SERIES = [
  { campo: 'temp',  titulo: 'Temperatura da água (°C)', cor: '#D98A4E', casas: 1 },
  { campo: 'nivel', titulo: 'Nível do sump (%)',        cor: '#35B3B3', casas: 0 },
  { campo: 'ph',    titulo: 'pH',                       cor: '#3FA87C', casas: 2 },
  { campo: 'vazao', titulo: 'Vazão do retorno (L/h)',   cor: '#A9BDB6', casas: 0 },
];

async function carregarHistorico() {
  const msg = $('hist-msg');
  msg.className = 'msg';
  msg.textContent = 'carregando…';

  const { data, error } = await sb.rpc('historico', {
    p_horas: horas, p_baldes: 240
  });

  /* Enquanto a janela for de 24 h, aproveita para contar os ciclos do dia
     em vez de fazer uma segunda consulta só para isso. */
  if (!error && data && horas === 24) {
    ciclos24 = data.reduce((s, r) => s + Number(r.ciclos || 0), 0);
    const e = $('v-ciclos'); if (e) e.textContent = ciclos24;
  }

  if (error) {
    msg.className = 'msg erro';
    msg.textContent = 'Não deu para ler o histórico: ' + error.message;
    return;
  }
  if (!data || data.length < 2) {
    msg.textContent = 'Ainda não há amostras suficientes neste período.';
    limparGraficos();
    return;
  }
  msg.textContent = `${data.length} pontos · ${data.reduce(
      (s, r) => s + Number(r.amostras), 0)} amostras`;

  const t = data.map((r) => new Date(r.balde).getTime() / 1000);
  limparGraficos();
  const cont = $('graficos');

  if (typeof uPlot === 'undefined') {
    throw new Error('a biblioteca de gráficos não carregou');
  }

  SERIES.forEach((s) => {
    const med = data.map((r) => num(r[s.campo + '_med']));
    const mn  = data.map((r) => num(r[s.campo + '_min']));
    const mx  = data.map((r) => num(r[s.campo + '_max']));
    if (med.every((v) => v === null)) return;

    const card = document.createElement('div');
    card.className = 'gcard';
    card.innerHTML = `<h3>${s.titulo}</h3>`;
    cont.appendChild(card);

    const larg = () => Math.max(card.clientWidth, 240);
    const u = new uPlot({
      width: larg(), height: 150,
      padding: [8, 10, 0, 0],
      cursor: { y: false, points: { size: 6 } },
      legend: { show: false },
      axes: [
        { stroke: '#70877F', grid: { stroke: '#1C2B28', width: 1 },
          ticks: { stroke: '#1C2B28' },
          font: '11px "IBM Plex Mono", monospace',
          /* O uPlot rotula em formato americano por padrão (11/12/26, 6pm).
             Aqui vai dia/mês e hora de 24, como se lê em português.     */
          values: (_u, splits) => rotulosEixo(splits) },
        { stroke: '#70877F', grid: { stroke: '#1C2B28', width: 1 },
          ticks: { stroke: '#1C2B28' }, size: 56,
          font: '11px "IBM Plex Mono", monospace',
          /* Sem isto o uPlot escolhe as casas sozinho e o pH sai com três
             (8,275), que não significam nada num eletrodo de vidro.    */
          values: (_u, splits) => splits.map(
            (v) => v == null ? '' : v.toFixed(s.casas)) },
      ],
      series: [
        { value: (_u, v) => v == null ? '--'
            : new Date(v * 1000).toLocaleString('pt-BR') },
        /* a faixa min–max vai por baixo, em traço fino: é ela que mostra o
           pico que a média esconde */
        { stroke: s.cor + '55', width: 1, points: { show: false } },
        { stroke: s.cor + '55', width: 1, points: { show: false } },
        { stroke: s.cor, width: 2, points: { show: false } },
      ],
    }, [t, mn, mx, med], card);

    graficos.push(u);
    const ro = new ResizeObserver(() => u.setSize({ width: larg(),
                                                    height: 150 }));
    ro.observe(card);
    u._ro = ro;
  });
}

function limparGraficos() {
  graficos.forEach((u) => { if (u._ro) u._ro.disconnect(); u.destroy(); });
  graficos = [];
  $('graficos').innerHTML = '';
}

/* ======================================================== alarmes ===== */

async function carregarAlarmes() {
  const { data, error } = await sb.rpc('alarmes', { p_limite: 40 });
  const t = $('tab-alarmes');
  if (error) {
    t.innerHTML = `<p class="vazio">Não deu para ler: ${error.message}</p>`;
    return;
  }
  if (!data || !data.length) {
    t.innerHTML = '<p class="vazio">Nenhum alarme registrado. Bom sinal.</p>';
    return;
  }
  t.innerHTML = data.map((r) => {
    const d = new Date(r.ts);
    return `<div class="linha">
      <span class="q">${d.toLocaleString('pt-BR')}</span>
      <span class="o">${escapar(r.alarme)}</span>
      <span class="d">${r.temp_c ?? '--'} °C · ${r.nivel_pct ?? '--'} %</span>
    </div>`;
  }).join('');
}

function escapar(s) {
  return String(s ?? '').replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ====================================================== batimento ===== */
/*  Mantém o projeto gratuito do Supabase acordado. Roda logado ou não: só
    abrir a página já conta como movimento no banco.

    O que ele NÃO resolve: página fechada. Para isso existe o agendamento no
    GitHub Actions, que bate uma vez por dia sem depender de ninguém.      */

async function baterPonto() {
  if (!C.BATIMENTO_MIN) return;
  const { data, error } = await sb.rpc('bater_ponto', { p_origem: 'web' });
  if (error) { console.warn('[ATO] batimento falhou:', error.message); return; }

  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return;
  const e = $('rodape-batimento');
  if (e) {
    const q = new Date(r.ultimo);
    e.textContent = `batimento ${r.total} · ${q.toLocaleString('pt-BR')}`;
    e.title = 'Grava um carimbo de tempo para o Supabase não pausar o '
            + 'projeto por inatividade.';
  }
}

baterPonto();
if (C.BATIMENTO_MIN) {
  setInterval(baterPonto, Math.max(C.BATIMENTO_MIN, 5) * 60 * 1000);
}

iniciar();
