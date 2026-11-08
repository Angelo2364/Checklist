<div align="center">
  <img src="public/Logo.svg" alt="Símbolo do Crysalis" width="112" />

  # Crysalis

  **Organize seus dias. Cresça no seu tempo.**

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
| **Preferências** | Escolha tema claro ou escuro, imagem de fundo, desfoque e o período do dia em que quer receber lembretes. |
| **Conta e backup** | Sincronize os dados com sua conta e exporte ou importe uma cópia em JSON. |

## 📱 Feito para o dia a dia

- Layout responsivo para celular e desktop.
- Pode ser instalado como **PWA** em navegadores compatíveis.
- Guia interativo na primeira visita, com opção de pular e rever pelas configurações.
- No celular, reordene tarefas e anotações com toque longo e arraste.
- Use `Enter` para confirmar uma tarefa ou anotação e `Shift + Enter` para pular uma linha no texto.
- Atalhos: `Ctrl + F` para abrir a criação de tarefa/anotação e `Ctrl + D` para abrir a criação de sessão. No Mac, use `⌘` no lugar de `Ctrl`.

## ☁️ Sincronização e notificações

O Crysalis usa uma conta para sincronizar os dados entre dispositivos. As notificações dependem da permissão do navegador e da disponibilidade do serviço de push; quando ativadas, o usuário pode limitar os avisos a um período específico do dia.

## 💾 Dados e privacidade

- Com uma conta conectada, tarefas, sessões, anotações, eventos, rotinas e contas são sincronizados com o Supabase.
- O app também mantém dados locais no navegador para carregar a interface e preservar preferências visuais deste aparelho.
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
  <strong>Organize seus dias. Cresça no seu tempo.</strong> 🌱
</div>
