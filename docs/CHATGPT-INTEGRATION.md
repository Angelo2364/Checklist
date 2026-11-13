# Conectar o Crysalis ao ChatGPT

O conector expõe tarefas pessoais, sessões e eventos do calendário. Ele não altera dados de amigos/equipes e não grava eventos na Agenda Google. Toda chamada usa a conta Crysalis que autorizou o ChatGPT.

## Depois de publicar o código

1. Rode `npx.cmd supabase db push --remote=jejubavadsbbdachklru` para aplicar a migração da operação atômica.
2. Rode `npx.cmd supabase functions deploy crysalis-ai --remote=jejubavadsbbdachklru --use-api`.
3. Publique o site. O caminho `/oauth/consent` precisa abrir a SPA do Crysalis.
4. No Supabase, abra **Authentication → OAuth Server**, habilite o servidor OAuth e deixe o caminho de autorização como `/oauth/consent`.
5. No editor do GPT, crie uma Action usando `docs/chatgpt-openapi.yaml`. A URL de callback do editor deve ser cadastrada como Redirect URI do OAuth App no Supabase. Depois preencha Client ID e Client Secret na autenticação OAuth da Action.

Os endpoints OAuth do projeto são:

- Authorization: `https://jejubavadsbbdachklru.supabase.co/auth/v1/oauth/authorize`
- Token: `https://jejubavadsbbdachklru.supabase.co/auth/v1/oauth/token`

O Supabase precisa emitir tokens OAuth em nome do usuário e a tela `/oauth/consent` pede autorização. Não use nem compartilhe uma service-role key com o GPT.

## Instruções para o GPT

> Você é o assistente do Crysalis. Use as ações para consultar, criar, editar e excluir tarefas pessoais e eventos. Considere datas e horários no fuso America/Sao_Paulo e confirme com o usuário quando o pedido for ambíguo. Para tarefas em uma sessão, consulte primeiro as sessões e escolha a correspondência exata. Antes de editar ou excluir, procure o item pelo título/data e confirme com o usuário qual item encontrou; exclusões devem sempre ser confirmadas. Resuma o resultado depois de cada alteração.

No OpenAPI, datas são enviadas como `YYYY-MM-DD` e horas como `HH:mm` em 24 horas. `scheduledFor` define em qual dia a tarefa aparece; `dueDate`/`dueTime` definem o prazo.
