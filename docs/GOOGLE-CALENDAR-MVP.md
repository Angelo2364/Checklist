# Google Calendar no Crysalis: configuração do MVP

## O que a integração faz

- Eventos criados, editados ou excluídos no calendário do Crysalis são sincronizados com o calendário principal do Google conectado.
- Calendários Google selecionados, inclusive calendários de feriados inscritos pela pessoa, aparecem no calendário do Crysalis. Eventos de calendários que a pessoa possui podem ser editados ou excluídos pelo Crysalis; calendários compartilhados sem propriedade e calendários de feriados ficam somente para leitura.
- Eventos pessoais já existentes podem ser enviados uma vez pelo botão **Enviar eventos existentes**. Essa ação é explícita para evitar criar cópias sem a pessoa pedir.
- O Crysalis não altera eventos que vieram de outros calendários.
- Ao desconectar, o token é revogado no Google e removido do Crysalis. Os eventos já criados no Google permanecem lá. Os IDs que ligam os eventos correspondentes ficam guardados enquanto a conta Crysalis existir, para evitar duplicatas se a conta for conectada novamente.

## Escopos OAuth usados

- `https://www.googleapis.com/auth/calendar.events.readonly`: leitura dos eventos dos calendários que a pessoa escolher.
- `https://www.googleapis.com/auth/calendar.events.owned`: criar, atualizar e excluir eventos em calendários que a pessoa possui; o Crysalis grava no calendário principal.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: listar os calendários disponíveis para a pessoa escolher.

O fluxo usa OAuth com `state` descartável e PKCE S256. O refresh token e o verificador PKCE são criptografados com AES-GCM no servidor. O navegador nunca recebe esses segredos. As tabelas de token, estado OAuth e vínculos de eventos não permitem acesso direto pelos papéis `anon` e `authenticated`; a Edge Function valida o usuário antes de operar sobre os dados dele.

## Configuração necessária antes de usar

### 1. Google Cloud

1. Crie/seleciona um projeto de produção no Google Cloud e habilite **Google Calendar API**.
2. Configure a tela de consentimento como aplicativo externo, com nome Crysalis, email de suporte e contato do desenvolvedor.
3. Cadastre `https://crysalis.me` como página inicial e `https://crysalis.me/privacidade.html` como política de privacidade. A política é pública e também está ligada na tela de login e nas configurações do Crysalis.
4. Verifique o domínio `crysalis.me` no Google Search Console para uma conta proprietária/editora do projeto.
5. Declare os três escopos listados acima na tela **Data Access**.
6. Crie um OAuth Client ID do tipo **Web application**. Adicione este URI de redirecionamento autorizado, sem barra final:

   `https://jejubavadsbbdachklru.supabase.co/functions/v1/google-calendar`

7. Guarde o Client ID e o Client Secret para configurar no Supabase. Não os coloque no código do frontend nem em arquivo versionado.

### 2. Supabase

Gere uma chave aleatória de 32 bytes no PowerShell. Guarde o resultado em um gerenciador de senhas; não o publique nem o envie no chat:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

No Supabase Dashboard, em **Project Settings → Edge Functions → Secrets**, adicione:

- `GOOGLE_CLIENT_ID`: Client ID criado no Google Cloud.
- `GOOGLE_CLIENT_SECRET`: Client Secret correspondente.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: a chave aleatória em Base64 gerada acima.
- `GOOGLE_REDIRECT_URI`: `https://jejubavadsbbdachklru.supabase.co/functions/v1/google-calendar`
- `CRYSALIS_ALLOWED_ORIGINS`: `https://crysalis.me,https://www.crysalis.me`

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo runtime da Edge Function. Nunca as copie para o cliente.

No PowerShell, dentro da pasta do projeto, aplique a migration e publique a função:

```powershell
npx.cmd supabase db push --remote=jejubavadsbbdachklru
npx.cmd supabase functions deploy google-calendar --remote=jejubavadsbbdachklru --use-api
```

Depois, publique o frontend pelo fluxo normal do site. A função usa `verify_jwt = false` por causa do callback OAuth GET; todas as ações POST da pessoa validam o JWT do Supabase dentro da própria função.

### 3. Teste e publicação OAuth

Deixe o app no estado **Testing** do consentimento e cadastre sua conta Google como test user. Conecte pelo Crysalis, confira a lista de calendários, crie/edite/exclua um evento de teste e confirme o resultado nos dois calendários.

Para liberar a conexão para qualquer usuário, publique a página inicial/política, confirme a verificação do domínio e envie a solicitação de verificação da marca e dos escopos pelo Google Cloud Verification Center. A solicitação deve explicar por que cada escopo é necessário e incluir um vídeo mostrando o consentimento e os recursos correspondentes. A aprovação é decisão do Google; o código e os materiais do Crysalis podem ser preparados para atender ao processo, mas ninguém consegue garantir o resultado ou prazo da análise.

## Limites conhecidos do MVP

- A sincronização depende de conexão ativa com Supabase e Google no momento da alteração. O Crysalis mantém a alteração local e mostra um aviso se não conseguir sincronizar; a repetição automática de operações que falharam offline fica para uma etapa posterior.
- Eventos de calendários Google que a pessoa não possui são somente leitura no Crysalis; para alterá-los, abra-os no Google Calendar.
- Feriados aparecem se o calendário correspondente estiver inscrito na Conta Google e selecionado nas configurações do Crysalis.
