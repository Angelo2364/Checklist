# Changelog — Crysalis (checklist)

Tudo o que foi feito nesta sessão, na ordem em que aconteceu.
Obs.: o registro não tem horário de cada mensagem, então não dá para separar "depois das 20h".
Se precisar só da parte da noite, apague as seções anteriores.

---

## 1. Visual: liquid glass
- Fundo da coluna do checklist virou *liquid glass* (blur + saturação, película translúcida, brilho nas bordas, bisel interno, sombra externa).
- Estendido para **todos os fundos**: coluna lateral, cabeçalho fixo, cabeçalho das sessões, barras de "adicionar", formulários, campos, atalhos, hovers e faixas de separação (tudo translúcido).
- Vale quando há imagem de fundo (`.com-fundo`), com variações para tema escuro e claro.
- Barra de rolagem fina e transparente, na cor do tema (`scrollbar-width: thin` + reserva para Safari antigo).

## 2. Papel de parede
- Diagnóstico do "zoom": o `cover` corta a imagem quando a proporção da janela não é 16:9.
- Modo **Inteira** agora preenche as sobras com a mesma imagem bem desfocada (`ck-fundo-preenche`).
- Perda de qualidade corrigida: a imagem era reduzida a 2560px e recomprimida em JPEG 82% para caber no `localStorage`. Agora o **arquivo original** fica no IndexedDB, sem recompressão.
- `bg.png` (em `public/`) é o fundo padrão, com **desfoque 10**; o usuário troca pela própria imagem e tem o botão **Voltar ao padrão**.
- Chave nova do desfoque no `localStorage` (`checklist:desfoqueFundo`), para o novo padrão valer para todos.

## 3. Layout e organização
- "Adicionar tarefa" e "Adicionar sessão" ficaram lado a lado, numa linha compacta (ícone **+**, texto menor e atalho).
- Tarefas sem sessão passaram para o **fim da lista**.
- Linha da tarefa no celular: repetição e prazo descem para a linha de baixo quando falta espaço, em vez de espremer o nome.

## 4. Temas
- Primeiro: tema escuro fixo (o app seguia o tema do sistema, e o claro deixava tudo branco com letras brancas).
- Depois: **escuro é o padrão** e o **claro é opcional**, nos ajustes do papel de parede (botões Tema escuro / Tema claro), com **letras pretas** e película do vidro mais opaca para dar leitura.
- Escolha salva por aparelho; aplicada antes de desenhar a tela (sem piscar), inclusive no login.

## 5. Backup manual
- **Exportar / Importar** em arquivo `.json` (tarefas, sessões, eventos, rotinas e contas). Importar substitui o que estiver no app e pede confirmação.

## 6. Conta e nuvem (Supabase)
- Tela de **login** por email e senha, criar conta, **esqueci minha senha** e tela de **nova senha** (link do email).
- **Sincronização**: carrega da nuvem ao entrar; conta nova sobe o que já existe no aparelho (só se o cache for dela); salva sozinho ~1,5 s depois de cada alteração; indicador "Salvando… / Salvo / Sem conexão / Conflito".
- Detecção de **conflito** entre aparelhos (compara `updated_at`), com as opções "Usar a da nuvem" e "Manter a deste aparelho"; ao voltar para a aba, puxa o que for mais novo.
- **Sair da conta** com ícone no topo: salva o pendente, limpa o cache local e remove a inscrição de push do aparelho.
- Arquivos: `Login.jsx`, `services/dados.js`, ajustes no `App.jsx`.
- Orientações: policies de RLS com `(select auth.uid())`, trigger de `updated_at`, limite de emails do Supabase e SMTP próprio, Redirect URLs, variáveis `VITE_*` na Vercel.

## 7. Agenda
- Eventos com **horário de início e de término** (o link do Google usa o término; antes eram sempre 1 h; término após a meia-noite vai para o dia seguinte).
- **Editar evento**: ícone de lápis, formulário preenchido, mudança de dia, Salvar / Cancelar.
- Lembretes de 1 dia e 1 hora no Google Agenda: **não dá pelo link**; a saída é configurar as notificações padrão no próprio Google Agenda (ou usar a API do Google, que não foi implementada).

## 8. Tarefas e lembretes
- **Observações** nas tarefas (criar e editar), exibidas em cinza abaixo do nome; voltam junto nas tarefas repetidas.
- **Intervalo dos lembretes** configurável: 15 min, 30 min, 1 h, 2 h ou 3 h (em horários redondos do relógio).
- Notificação no celular: passou a usar `registration.showNotification` via Service Worker (o Android não aceita `new Notification()`).
- **Ícone** do Crysalis nas notificações locais também (antes aparecia um "W" cinza).

## 9. Rodapé
- Linha pequena: "feito por Moony · email".
- Easter egg: ao parar o mouse sobre o nome por ~3 s, aparece **"Luna"**.
- Clicar no email **copia o endereço** (o `mailto:` não abria em computadores sem programa de email).

## 10. Notificações push (avisos com o app fechado)
- Tabela `push_subscriptions` com RLS + agendamento (`pg_cron` + `pg_net` + Vault) chamando a função a cada minuto — `supabase/push.sql`.
- Edge Function `enviar-lembretes` (`supabase/functions/enviar-lembretes/index.ts`):
  - resumo periódico no fuso de cada aparelho, com prioridade, prazo e eventos do dia;
  - avisos de prazo 45 min e 15 min antes ("chamadão");
  - prioridade alta no envio, `?forcar=1` para teste, limpeza de aparelhos inativos (404/410).
- Cliente: `services/push.js` (inscrever, atualizar intervalo, desativar, mostrar o motivo quando não ativa).
- O app mostra o status ("chegam neste aparelho mesmo com o app fechado") e desliga os lembretes locais quando o push está ativo.
- Descoberta: o projeto já tinha um `sw.js` gerado pelo plugin de PWA (Workbox). Solução: `public/push-sw.js` anexado a ele com `workbox.importScripts` no `vite.config.js` (e removidos o `sw.js` e o `manifest.webmanifest` avulsos).
- Ajustes no manifest: removida a entrada `any maskable` desaconselhada.
- Configurado fora do código: chaves VAPID, segredos da função, `VITE_VAPID_PUBLIC_KEY` na Vercel e no `.env.local`, deploy da função.
- Pop-up "na cara" no Android: era configuração do celular (canal de notificação do app em **Urgente**), não código.
- `push-sw.js` também fecha a notificação antiga de mesma tag antes de mostrar a nova. Mudança opcional, mantida só por segurança.

---

## 0.94 — Conector de IA para tarefas e agenda
- Adicionada Edge Function protegida por JWT para consultar, criar, editar e excluir tarefas pessoais e eventos do calendário.
- Incluídos consulta de sessões para associar tarefas, datas no fuso `America/Sao_Paulo` e confirmação para operações de escrita no OpenAPI do GPT.
- As alterações são atômicas no Supabase e usam `auth.uid()` + RLS; não compartilham a chave `service_role`.
- Criada a tela de consentimento OAuth em `/oauth/consent` e o rewrite para a SPA no Vercel.
- Migração `20261113160058_crysalis_ai_actions` e Edge Function `crysalis-ai` já aplicadas no Supabase de produção. Falta publicar o site, ativar o OAuth Server no painel e cadastrar o GPT Action/OAuth App.
- Configuração para Gemini Apps fica para uma etapa posterior; o contrato OpenAPI/MCP pode ser reutilizado depois.

## Pendências e ideias
- Ícone pequeno (badge) monochrome para a barra de status do Android (precisa do logo em silhueta branca).
- SMTP próprio no Supabase para o cadastro de amigos (o envio padrão tem limite baixíssimo e só entrega a membros da equipe).
- Lembretes de 1 dia e 1 hora no Google Agenda via API do Google (exige projeto no Google Cloud).
- Avisos de "tarefa de volta" (rotinas) continuam só locais, sem push.
- `theme_color` / `background_color` do manifest ainda estão brancos; trocar por `#1b1828` deixaria a abertura do app instalado escura.
