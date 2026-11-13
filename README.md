# Painel web do ATO

Página estática que mostra o aquário de qualquer lugar: estado agora,
gráficos de histórico e alarmes. Hospedada de graça no GitHub Pages, lendo
direto do Supabase.

Ela **só lê**. Nenhum comando sai daqui — para parar o sistema continuam
valendo o Telegram e a página local do ATO, que falam direto com o ESP32.
Um botão de emergência que depende de banco, de internet e de três saltos
de rede não é um botão de emergência.

## O problema que isto resolve

Uma página estática não tem servidor: a chave do Supabase vai no navegador
de quem abrir, e qualquer um consegue lê-la. Até agora a chave `anon` era a
mesma que o ESP32 usava para gravar — publicá-la significaria dar permissão
de escrita ao mundo.

A separação que o `10-seguranca.sql` faz:

| | Quem | Como |
|---|---|---|
| **Ler** | só contas autorizadas | login por e-mail; a chave `anon` sozinha não vê nada |
| **Escrever** | só o ESP32 | função no banco que exige o `SB_TOKEN`, que vive no firmware |

A chave que vai pública não lê nem escreve. É isso que torna a publicação
segura.

## Ordem de instalação

Siga nesta ordem — o firmware só funciona depois do SQL, e a página só
funciona depois do cadastro.

### 1. Banco

No **SQL Editor** do Supabase, rode os dois arquivos inteiros:

```
sql/10-seguranca.sql
sql/20-consultas.sql
```

Depois gere o token do dispositivo. Primeiro isto, e **copie o resultado**:

```sql
select encode(extensions.gen_random_bytes(24), 'hex');
```

E então, trocando `COLE_O_TOKEN` pelo que saiu acima:

```sql
insert into privado.dispositivo (id, token_hash)
values ('ato-aquario',
        extensions.crypt('COLE_O_TOKEN', extensions.gen_salt('bf')))
on conflict (id) do update
  set token_hash = excluded.token_hash, criado_em = now();
```

### 2. Firmware

No `main.cpp`, seção 1c:

```cpp
#define LOG_DESTINO   2
#define SB_URL        "https://SEUPROJETO.supabase.co"
#define SB_ANON       "a-chave-anon"
#define SB_TOKEN      "o-token-que-voce-gerou"
```

Grave e confira no monitor serial. Se aparecer `Registro: HTTP 401`, o
token não bate. `HTTP 404` significa que o `10-seguranca.sql` não rodou.

### 3. Fechar o cadastro — **este passo é o que faz o login valer**

Em **Authentication → Sign In / Providers → Email**, desligue
**"Allow new users to sign up"**.

Sem isso, qualquer pessoa que descobrir o endereço da página cria uma conta
sozinha, entra, e lê tudo. O login viraria enfeite.

Com o cadastro fechado, crie a sua conta à mão em
**Authentication → Users → Add user**, com o seu e-mail. Repita para cada
pessoa que deva ter acesso.

### 4. Liberar o endereço da página

Em **Authentication → URL Configuration**:

- **Site URL**: `https://SEUUSUARIO.github.io/ato-aquario/`
- **Redirect URLs**: a mesma, e também `http://localhost:8000/` se quiser
  testar na sua máquina

Sem isso o link do e-mail chega, mas não leva a lugar nenhum.

### 5. Publicar

Copie `index.html`, `estilo.css`, `app.js` e `config.js` para a pasta do
site no seu repositório. Preencha o `config.js`:

```js
SUPABASE_URL:  'https://SEUPROJETO.supabase.co',
SUPABASE_ANON: 'a-chave-anon',
```

E, no GitHub: **Settings → Pages → Source: Deploy from a branch**,
escolhendo a branch e a pasta. Leva uns dois minutos para o endereço subir.

O resto do `config.js` são os limiares usados só para desenhar — ponha os
mesmos valores que estão na página local do ATO.

## Conferir se ficou seguro

Quatro testes. Os quatro têm de dar o resultado da direita.

| Teste | Resultado esperado |
|---|---|
| Abrir a página numa janela anônima | tela de login, nenhum dado |
| Tentar entrar com um e-mail não cadastrado | recusado |
| `select * from aquario` com a chave anon, sem login | zero linhas |
| `select registrar_amostra('errado', 50)` | erro "nao autorizado" |

As duas últimas se fazem no SQL Editor com `set role anon;` antes.

## Se precisar trocar o token

Repita o passo 1 (gerar e gravar) e o passo 2 (firmware). O token antigo
para de funcionar na hora. Nada mais muda.

## Quando não funciona

| Sintoma | Causa provável |
|---|---|
| A página pede login e o e-mail nunca chega | e-mail não cadastrado, ou cadastro fechado sem o usuário criado |
| O link do e-mail abre e volta para o login | a URL não está em Redirect URLs |
| Entra, mas tudo mostra `--` | nenhuma amostra gravada; confira `LOG_DESTINO` no firmware |
| Entra e o histórico fica vazio | o `20-consultas.sql` não rodou |
| "Os gráficos não carregaram" | a biblioteca uPlot não baixou; o resto da página continua válido |
| `Registro: HTTP 401` no serial do ESP32 | `SB_TOKEN` não bate com o cadastrado |
| `Registro: HTTP 404` no serial | o `10-seguranca.sql` não rodou neste projeto |
| `Registro: HTTP 400` | falta a coluna `ventilador`; rode o `10-seguranca.sql` |

## O que NUNCA vai no `config.js`

- a chave `service_role` — ela ignora todas as políticas de segurança
- o `SB_TOKEN` do ESP32 — ele é a senha de escrita

Os dois ficam, respectivamente, no painel do Supabase e dentro do firmware.
Nenhum dos dois tem o que fazer num arquivo que o navegador baixa.
