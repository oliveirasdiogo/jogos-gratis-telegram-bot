# Jogos Grátis — Bot para Telegram

[![Verificações](https://github.com/oliveirasdiogo/jogos-gratis-telegram-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/oliveirasdiogo/jogos-gratis-telegram-bot/actions/workflows/ci.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript 7](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

Bot serverless que procura jogos completos gratuitos para PC e envia avisos pelo
Telegram. Cada promoção é enviada automaticamente uma única vez para cada
usuário. Consultas manuais permitem rever as ofertas ativas ou o histórico dos
últimos sete dias.

Depois da publicação, seu computador pode ficar desligado: o código roda no
Cloudflare Workers, o agendamento usa Cron Triggers e os dados ficam no banco
Cloudflare D1.

## Índice

- [Recursos](#recursos)
- [Como funciona](#como-funciona)
- [Comandos do Telegram](#comandos-do-telegram)
- [Custo esperado](#custo-esperado)
- [Pré-requisitos](#pré-requisitos)
- [Instalação completa no Windows](#instalação-completa-no-windows)
- [Escolher quem pode usar o bot](#escolher-quem-pode-usar-o-bot)
- [Alterar o intervalo de consulta](#alterar-o-intervalo-de-consulta)
- [Regras de repetição e histórico](#regras-de-repetição-e-histórico)
- [Preferências de plataforma](#preferências-de-plataforma)
- [Desenvolvimento e atualização](#desenvolvimento-e-atualização)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Solução de problemas](#solução-de-problemas)
- [Segurança](#segurança)
- [Fonte das ofertas](#fonte-das-ofertas)
- [Licença](#licença)

## Recursos

- Consulta automática à GamerPower a cada 30 minutos.
- Ofertas para Steam, Epic Games Store, GOG, itch.io, DRM-Free e outras lojas de
  PC.
- Filtragem de jogos completos; loot, DLCs e betas informados como outros tipos
  pela fonte são descartados.
- Deduplicação por promoção e por chat do Telegram.
- Histórico manual dos últimos sete dias com `/ultimos7dias`.
- Preferências de lojas diferentes para cada usuário.
- Nova tentativa segura quando um envio falha.
- Desativação dos avisos quando o usuário bloqueia o bot.
- Três modos de acesso: aprovação manual, somente proprietário ou aberto.
- Webhook validado por segredo.
- Tokens armazenados como segredos da Cloudflare, fora do código.
- Testes automatizados e verificação no GitHub Actions.

## Como funciona

```text
Cron da Cloudflare (a cada 30 min)
              |
              v
       API da GamerPower
              |
              v
   Worker filtra jogos de PC
              |
              v
 D1 guarda catálogo + histórico
              |
              v
 envia somente promoções ainda não
 notificadas para cada chat aprovado
```

O Telegram envia comandos ao Worker por webhook. O computador usado para
configurar o projeto não participa do funcionamento diário.

## Comandos do Telegram

| Comando | Ação |
|---|---|
| `/start` | Solicita acesso ou ativa os avisos, conforme o modo configurado |
| `/agora` | Mostra novamente os jogos grátis ativos |
| `/ultimos7dias` | Mostra as ofertas registradas nos últimos sete dias |
| `/plataformas` | Mostra ou altera as lojas acompanhadas |
| `/status` | Mostra acesso, avisos, plataformas e intervalo |
| `/parar` | Desativa os avisos automáticos |
| `/meuid` | Mostra o ID numérico do chat |
| `/ajuda` | Mostra os comandos disponíveis |

Comandos exclusivos do proprietário:

| Comando | Ação |
|---|---|
| `/pendentes` | Lista solicitações aguardando análise |
| `/autorizados` | Lista usuários aprovados |
| `/aprovar ID` | Aprova um usuário |
| `/negar ID` | Nega uma solicitação |
| `/revogar ID` | Revoga um acesso existente |

Exemplos:

```text
/plataformas steam epic gog
/plataformas todas
/aprovar 123456789
```

## Custo esperado

O projeto foi pensado para uso pessoal ou com poucos usuários no plano gratuito
da Cloudflare. O cron padrão executa 48 vezes por dia. Como referência, o plano
gratuito do Workers oferece atualmente 100.000 requisições por dia, e o D1
oferece 5 milhões de linhas lidas e 100.000 linhas gravadas por dia.

Poucas pessoas usando o bot ficam muito abaixo desses números em condições
normais. Isso não é uma garantia permanente: limites e preços podem mudar, e
um uso muito maior aumenta as operações. Consulte sempre a
[página de preços do Workers](https://developers.cloudflare.com/workers/platform/pricing/)
e os [limites do D1](https://developers.cloudflare.com/d1/platform/limits/).

Não é necessário contratar VPS, manter servidor doméstico ou deixar o
computador ligado.

## Pré-requisitos

Você precisará de:

- conta gratuita no [Telegram](https://telegram.org/);
- conta gratuita na [Cloudflare](https://dash.cloudflare.com/sign-up);
- Node.js 22 ou mais recente, de preferência a versão LTS;
- Git, caso queira clonar o repositório em vez de baixar o ZIP.

O Node.js e o Git são necessários apenas para configurar, publicar e atualizar o
projeto. O bot publicado funciona sem eles no seu computador.

## Instalação completa no Windows

### 1. Instalar e verificar o Node.js

Baixe a versão LTS em [nodejs.org](https://nodejs.org/), conclua a instalação e
feche todas as janelas do PowerShell. Abra uma nova janela e verifique:

```powershell
node --version
npm.cmd --version
```

Se aparecer `npm não é reconhecido`, o Node.js ainda não está instalado ou a
janela foi aberta antes da instalação. Reinicie o PowerShell; se necessário,
reinicie o Windows e confirme que `C:\Program Files\nodejs\` está no
`PATH`.

Este guia usa `npm.cmd` e `npx.cmd`. Isso evita o erro do PowerShell
`npx.ps1 não pode ser carregado porque a execução de scripts foi desabilitada`
sem precisar alterar a política de execução do Windows.

### 2. Baixar o projeto

Com Git:

```powershell
git clone https://github.com/oliveirasdiogo/jogos-gratis-telegram-bot.git
Set-Location .\jogos-gratis-telegram-bot
```

Ou use **Code > Download ZIP** no GitHub, extraia o arquivo, abra a pasta no
Explorador, clique na barra de endereço, digite `powershell` e pressione Enter.

Instale as dependências:

```powershell
npm.cmd install
```

### 3. Entrar na Cloudflare

```powershell
npx.cmd wrangler login
```

O navegador abrirá a tela de autorização. Depois, confirme a conta:

```powershell
npx.cmd wrangler whoami
```

### 4. Criar o bot no Telegram

1. Abra uma conversa com [@BotFather](https://t.me/BotFather).
2. Envie `/newbot`.
3. Escolha o nome visível.
4. Escolha um identificador terminado em `bot`.
5. Guarde o token recebido em local seguro.

Não coloque esse token no README, no código, em `wrangler.jsonc`, em issues ou
em commits.

### 5. Criar a configuração local

O arquivo real de configuração não é enviado ao GitHub porque contém o ID do seu
banco D1. Crie-o a partir do modelo:

```powershell
Copy-Item .\wrangler.example.jsonc .\wrangler.jsonc
```

### 6. Criar o banco D1

```powershell
npx.cmd wrangler d1 create jogos-gratis-bot
```

O Wrangler mostrará um `database_id`. Abra `wrangler.jsonc` e substitua:

```jsonc
"database_id": "SUBSTITUA_PELO_ID_DO_D1"
```

pelo ID que apareceu no terminal. Não altere o nome do binding `DB`.

Crie as tabelas no banco remoto:

```powershell
npm.cmd run db:migrate:remote
```

As duas migrações devem aparecer como aplicadas.

### 7. Fazer a primeira publicação

```powershell
npm.cmd run deploy
```

Guarde a URL exibida, semelhante a:

```text
https://jogos-gratis-telegram-bot.seu-subdominio.workers.dev
```

Teste o endereço de saúde no navegador:

```text
https://jogos-gratis-telegram-bot.seu-subdominio.workers.dev/health
```

### 8. Cadastrar os três segredos iniciais

Gere duas chaves diferentes, executando este comando duas vezes:

```powershell
[guid]::NewGuid().ToString("N")
```

Cadastre os segredos de forma interativa:

```powershell
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN
npx.cmd wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx.cmd wrangler secret put ADMIN_SETUP_KEY
```

Quando o Wrangler pedir o valor:

- `TELEGRAM_BOT_TOKEN`: token fornecido pelo BotFather;
- `TELEGRAM_WEBHOOK_SECRET`: primeira chave aleatória;
- `ADMIN_SETUP_KEY`: segunda chave aleatória.

O segredo do webhook deve usar apenas letras, números, hífen e sublinhado. A
chave gerada acima atende a essa regra.

### 9. Configurar o webhook

Substitua a URL no comando abaixo pela URL do seu Worker. O PowerShell pedirá a
`ADMIN_SETUP_KEY` sem mostrá-la na tela:

```powershell
$seguro = Read-Host "ADMIN_SETUP_KEY" -AsSecureString
$chave = [System.Net.NetworkCredential]::new("", $seguro).Password
$cabecalhos = @{ Authorization = "Bearer $chave" }

Invoke-RestMethod -Method Post `
  -Uri "https://jogos-gratis-telegram-bot.seu-subdominio.workers.dev/admin/setup-webhook" `
  -Headers $cabecalhos

Remove-Variable seguro, chave, cabecalhos
```

Resposta esperada:

```json
{
  "ok": true,
  "webhook_url": "https://.../telegram/webhook",
  "commands_configured": true
}
```

### 10. Descobrir e cadastrar o proprietário

Abra uma conversa privada com seu bot e envie:

```text
/meuid
```

Copie o número retornado e cadastre-o:

```powershell
npx.cmd wrangler secret put OWNER_CHAT_ID
```

Cole somente o número. Depois volte ao Telegram e envie `/start`. Esse usuário
será o proprietário e poderá executar os comandos administrativos.

### 11. Testar

No Telegram:

1. envie `/start`;
2. aguarde a consulta inicial;
3. envie `/status`;
4. envie `/ultimos7dias`.

Para acompanhar os logs enquanto testa:

```powershell
npx.cmd wrangler tail
```

## Escolher quem pode usar o bot

Abra o arquivo local `wrangler.jsonc` e altere `ACCESS_MODE` dentro de
`vars`:

```jsonc
"vars": {
  "ACCESS_MODE": "approval",
  "CHECK_INTERVAL_LABEL": "30 minutos"
}
```

Há três opções:

| Valor | Comportamento |
|---|---|
| `approval` | Qualquer pessoa pode solicitar acesso, mas só funciona após o proprietário aprovar |
| `owner_only` | Somente o `OWNER_CHAT_ID` usa o bot; outros usuários e envios agendados são bloqueados |
| `open` | Qualquer pessoa que enviar `/start` é liberada automaticamente |

Depois de mudar o valor, publique novamente:

```powershell
npm.cmd run deploy
```

### Deixar exclusivo para duas pessoas

Use `"ACCESS_MODE": "approval"`. O proprietário já tem acesso. Peça à segunda
pessoa para enviar `/start`; você receberá no Telegram o Chat ID e os comandos
prontos. Execute:

```text
/aprovar ID_DA_SEGUNDA_PESSOA
```

Não aprove mais ninguém. Assim, apenas o proprietário e essa pessoa poderão
usar o bot.

### Exigir aprovação para cada nova pessoa

Mantenha o modo `approval`. O fluxo é:

1. a pessoa envia `/start`;
2. o pedido fica pendente;
3. o proprietário recebe uma notificação;
4. o proprietário usa `/aprovar ID` ou `/negar ID`;
5. após a aprovação, a pessoa envia `/start` novamente.

Use `/pendentes`, `/autorizados` e `/revogar ID` para administrar os
acessos.

### Deixar totalmente aberto

Use `"ACCESS_MODE": "open"` e faça o deploy. Qualquer pessoa que localizar o
bot poderá enviar `/start` e ativar notificações. Os comandos administrativos
continuam exclusivos do proprietário.

Ao voltar de `open` para `approval`, usuários que já foram aprovados
automaticamente permanecem aprovados. Revogue manualmente quem não deve
continuar. O modo `owner_only` não apaga aprovações: ele apenas impede seu uso
enquanto estiver ativo.

## Alterar o intervalo de consulta

O padrão fica em `wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["*/30 * * * *"]
}
```

Exemplos:

| Intervalo | Cron | Execuções por dia |
|---|---:|---:|
| 30 minutos | `*/30 * * * *` | 48 |
| 1 hora | `0 * * * *` | 24 |
| 3 horas | `0 */3 * * *` | 8 |
| 6 horas | `0 */6 * * *` | 4 |

Também atualize o texto mostrado pelo comando `/status`:

```jsonc
"CHECK_INTERVAL_LABEL": "6 horas"
```

Depois publique:

```powershell
npm.cmd run deploy
```

Cron Triggers usam UTC. Para intervalos como 30 minutos ou 6 horas isso não
altera a frequência; o fuso importa quando você escolhe um horário fixo.

## Regras de repetição e histórico

- O ID fornecido pela GamerPower identifica a promoção.
- Uma promoção não é enviada duas vezes automaticamente para o mesmo chat.
- Se o mesmo jogo aparecer no futuro com um novo ID de promoção, será avisado
  novamente.
- A lista exibida durante `/start` é registrada como entregue, evitando que o
  cron repita aqueles jogos logo depois.
- `/agora` e `/ultimos7dias` podem mostrar jogos já vistos porque foram
  acionados manualmente.
- O histórico começa na primeira execução do bot.
- Ofertas que somem da fonte deixam de ficar ativas, mas continuam no banco para
  compor o histórico.

## Preferências de plataforma

Sem configuração adicional, cada novo usuário acompanha todas as plataformas.
Para escolher:

```text
/plataformas steam epic
/plataformas steam epic gog itchio
/plataformas todas
```

Nomes aceitos: `steam`, `epic`, `gog`, `itchio`, `drm-free` e `pc`.

## Desenvolvimento e atualização

Antes de publicar alterações:

```powershell
npm.cmd run check
```

Executar localmente:

```powershell
npm.cmd run dev
```

Publicar uma nova versão:

```powershell
npm.cmd run deploy
```

Aplicar novas migrações no D1:

```powershell
npm.cmd run db:migrate:remote
```

O GitHub Actions executa automaticamente a verificação de tipos e os testes em
pushes e pull requests. Ele não faz deploy e não recebe seus segredos.

## Estrutura do projeto

```text
.
|-- .github/workflows/ci.yml   # testes no GitHub
|-- migrations/                # estrutura e atualizações do D1
|-- src/
|   |-- bot.ts                 # comandos e controle de acesso
|   |-- db.ts                  # consultas ao D1
|   |-- domain.ts              # regras puras e formatação
|   |-- gamerpower.ts          # integração com a fonte
|   |-- index.ts               # rotas, webhook e cron
|   |-- service.ts             # sincronização e notificações
|   |-- telegram.ts            # integração com o Telegram
|   `-- types.ts               # tipos compartilhados
|-- test/                      # testes automatizados
|-- wrangler.example.jsonc     # modelo público de configuração
`-- package.json
```

## Solução de problemas

### `npm` não é reconhecido

Instale o Node.js LTS, feche o PowerShell e abra novamente. Teste
`node --version` e `npm.cmd --version`. Se somente `npm` falhar, use
`npm.cmd` como nos exemplos.

### `npx.ps1` foi bloqueado pela política de execução

Use `npx.cmd`, por exemplo:

```powershell
npx.cmd wrangler login
```

Não é necessário liberar a execução de todos os scripts do Windows.

### O Wrangler não encontra `wrangler.jsonc`

Crie a cópia local:

```powershell
Copy-Item .\wrangler.example.jsonc .\wrangler.jsonc
```

Depois substitua o ID do D1.

### Erro de banco ou tabela inexistente

Confirme o `database_id` e execute:

```powershell
npm.cmd run db:migrate:remote
```

### O bot não responde

- confirme que a conversa é privada;
- teste `/health`;
- execute `npx.cmd wrangler tail`;
- configure novamente o webhook;
- confira os segredos com `npx.cmd wrangler secret list`;
- confirme que `OWNER_CHAT_ID` contém somente o número retornado por
  `/meuid`.

### Outra pessoa continua pendente

Verifique se `ACCESS_MODE` é `approval`, use `/pendentes`, aprove com
`/aprovar ID` e peça para a pessoa enviar `/start` novamente.

### Alterei o cron, mas nada mudou

É necessário executar `npm.cmd run deploy` depois de salvar
`wrangler.jsonc`. A propagação de alterações do Cron Trigger pode levar alguns
minutos.

## Segurança

- Nunca grave segredos em arquivos versionados.
- `.dev.vars`, `.env`, `.wrangler` e `wrangler.jsonc` estão no
  `.gitignore`.
- Use `wrangler secret put` de forma interativa.
- Se o token do Telegram vazar, revogue-o imediatamente no BotFather.
- O webhook exige `X-Telegram-Bot-Api-Secret-Token` válido.
- O endpoint administrativo exige `ADMIN_SETUP_KEY` e só configura o webhook
  para o próprio domínio do Worker.

Veja também [SECURITY.md](SECURITY.md).

## Fonte das ofertas

O projeto usa a [API da GamerPower](https://www.gamerpower.com/api-read), que
não exige chave e solicita atribuição com link. A atribuição é incluída no
rodapé das mensagens. A rapidez e a cobertura dos avisos dependem da atualização
dessa fonte.

Este projeto não é afiliado à Steam, Epic Games, GOG, itch.io, Telegram,
GamerPower ou Cloudflare.

## Licença

Distribuído sob a [licença MIT](LICENSE).
