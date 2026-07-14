# Segurança

## Dados que nunca devem ser publicados

Não abra issues, commits ou capturas de tela contendo estes valores:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `ADMIN_SETUP_KEY`
- conteúdo real do arquivo `.dev.vars`

O arquivo `wrangler.jsonc` também fica fora do Git porque contém o identificador
da instância D1 de cada instalação. O repositório mantém apenas
`wrangler.example.jsonc`.

## Se um segredo vazar

1. Revogue o token do bot imediatamente no `@BotFather`, caso ele esteja
   envolvido.
2. Gere novos valores para os demais segredos.
3. Atualize-os de forma interativa com `npx.cmd wrangler secret put NOME`.
4. Execute novamente o endpoint `/admin/setup-webhook` se o token ou o segredo
   do webhook tiver sido alterado.
5. Remova o segredo do histórico do Git. Apagá-lo apenas do commit mais recente
   não é suficiente.

## Relato de vulnerabilidades

Não publique detalhes exploráveis em uma issue pública. Entre em contato de
forma privada com o mantenedor pelo perfil
[@oliveirasdiogo](https://github.com/oliveirasdiogo).
