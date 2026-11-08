<div align="center">
  <img src="public/Logo.svg" alt="Símbolo do Crysalis" width="112" />

  # Crysalis

  **Um espaço leve para organizar tarefas, ideias e compromissos.**

  Checklist, anotações, calendário e rotina em um só lugar — com sincronização entre dispositivos.

  [Abrir o Crysalis](https://www.crysalis.me)

  <br />

  ![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
  ![Supabase](https://img.shields.io/badge/Supabase-auth%20%26%20sync-3ecf8e?logo=supabase&logoColor=white)
  ![PWA](https://img.shields.io/badge/PWA-instalável-6b4eff)
</div>

---

## ✨ O que é

O **Crysalis** é um organizador pessoal feito para reunir o que costuma ficar espalhado: tarefas, notas, eventos, rotinas e contas recorrentes. A interface se adapta a celular e computador, com temas claro e escuro e opções para personalizar o papel de parede.

Entre com sua conta para sincronizar seus dados com a nuvem e continuar de onde parou em outro aparelho. Também é possível exportar e importar um backup em JSON.

## 🧭 O que dá para fazer

| Área | Recursos |
| --- | --- |
| **Checklist** | Crie tarefas, organize-as em sessões, defina prioridade, prazo e repetição. Reordene os itens por arrastar e soltar. |
| **Anotações** | Guarde ideias com título, data e descrição opcional. Use sessões para separar os assuntos e reorganize as notas como preferir. |
| **Calendário** | Registre eventos com data, horário, endereço e descrição. Abra endereços no Google Maps ou prepare o evento no Google Agenda. |
| **Rotinas** | Acompanhe tarefas recorrentes e escolha a frequência, o horário e a prioridade. |
| **Contas** | Cadastre despesas mensais, parcelas e vencimentos; acompanhe o total, o que já foi pago e o que falta pagar. |
| **Lembretes** | Receba notificações de tarefas pendentes e avisos de prazo, conforme as permissões e a configuração do navegador e do servidor. |
| **Preferências** | Escolha tema claro ou escuro, imagem de fundo, desfoque e ajuste da imagem. |
| **Conta e backup** | Sincronize os dados com sua conta e exporte ou importe uma cópia em JSON. |

## 📱 Feito para o dia a dia

- Layout responsivo para celular e desktop.
- Pode ser instalado como **PWA** em navegadores compatíveis.
- No celular, reordene tarefas e anotações com toque longo e arraste.
- Use `Enter` para confirmar uma tarefa ou anotação e `Shift + Enter` para pular uma linha no texto.
- Atalhos: `Ctrl + F` para abrir a criação de tarefa/anotação e `Ctrl + D` para abrir a criação de sessão. No Mac, use `⌘` no lugar de `Ctrl`.

## 🚀 Rodar localmente

### Requisitos

- Node.js e npm.
- Um projeto Supabase configurado para autenticação e sincronização.

### Instalação

```bash
git clone <URL_DO_REPOSITORIO>
cd checklist
npm install
```

Crie um arquivo `.env.local` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_DO_SUPABASE
VITE_VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA_VAPID
```

As variáveis do Supabase são usadas para autenticação e sincronização. A chave VAPID pública habilita a inscrição para notificações push; os lembretes em segundo plano também dependem da configuração do servidor descrita abaixo.

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O Vite exibirá o endereço local no terminal, normalmente `http://localhost:5173`.

### Scripts disponíveis

| Comando | Ação |
| --- | --- |
| `npm run dev` | Inicia o ambiente de desenvolvimento. |
| `npm run lint` | Verifica o código com ESLint. |
| `npm run build` | Gera a versão de produção em `dist/`. |
| `npm run preview` | Abre localmente uma prévia da versão gerada. |
| `npm run deploy` | Publica o conteúdo de `dist/` com `gh-pages`. |

## ☁️ Supabase e notificações

O projeto usa o Supabase para autenticação e sincronização. Para que essa parte funcione, configure o projeto Supabase, as tabelas e as políticas de acesso usadas pelo app. Cada conta deve acessar somente os próprios dados.

Os lembretes push em segundo plano usam a Edge Function `supabase/functions/enviar-lembretes`. Para habilitá-los, configure e publique a função, o agendamento do `pg_cron` e os segredos VAPID e de cron no Supabase. O navegador também precisa permitir notificações. Sem essa configuração, o app pode continuar funcionando, mas os lembretes em segundo plano não estarão disponíveis.

> **Segurança:** mantenha `.env.local` fora do Git. Nunca coloque a `service_role` do Supabase, a chave VAPID privada ou o segredo do cron em variáveis `VITE_*` ou no código do navegador. A chave pública do Supabase deve ser protegida por políticas RLS adequadas.

## 💾 Dados e privacidade

- Com uma conta conectada, tarefas, sessões, anotações, eventos, rotinas e contas são sincronizados com o Supabase.
- O app também mantém dados locais no navegador para carregar a interface e preservar preferências deste aparelho.
- O papel de parede escolhido e as permissões de notificação dependem do navegador/dispositivo; não são substitutos para o backup.
- Use **Configurações → Conta → Exportar backup** para baixar uma cópia dos seus dados. A importação substitui os dados atuais pelos dados do arquivo selecionado.

## 🧰 Tecnologias

- **React** para a interface.
- **Vite** para desenvolvimento e build.
- **Supabase** para autenticação, sincronização e funções de servidor.
- **Service Worker / PWA** para instalação e suporte a notificações.
- **Capacitor** para integração com Android.

## 📁 Estrutura principal

```text
src/
├── App.jsx                  # Interface e lógica principal
├── App.css                  # Estilos do aplicativo
├── Login.jsx                # Entrar, criar conta e recuperar senha
├── main.jsx                 # Inicialização do React
└── services/
    ├── dados.js             # Leitura e gravação dos dados na nuvem
    ├── push.js              # Inscrição e gestão de notificações push
    └── supabase.js          # Cliente Supabase

public/
└── push-sw.js               # Tratamento de notificações no service worker
```

---

<div align="center">
  Feito para deixar a rotina mais clara — uma tarefa de cada vez. 🌱
</div>
