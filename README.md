# Checklist

Lista de tarefas em React com sessões, prioridades por cor e lembretes no computador a cada 30 minutos. Tudo fica salvo no próprio navegador, sem servidor e sem conta.

## O que ele faz

- **Tarefas:** adicionar, marcar e apagar. O círculo tem três estados a cada clique: pendente, meio feita (círculo pela metade) e feita.
- **Sessões:** agrupar tarefas (por exemplo "Afazeres do RPG"). Também dá para ter tarefas soltas, fora de qualquer sessão. Cada sessão pode ser recolhida e mostra quantas tarefas já foram feitas.
- **Tarefas que se repetem:** ao criar a tarefa, escolha "Repetir" (todo dia, toda semana, a cada N dias). Mesmo que você apague ou conclua, ela volta quando chegar o dia. Para parar, apague a rotina na coluna da direita.
- **Calendário:** coluna lateral com o mês, eventos com horário, endereço (link para o Google Maps) e descrição opcionais e um botão "Google" que abre o evento já preenchido no Google Agenda. Os eventos de hoje também entram na notificação.
- **Reordenar:** a alça com bolinhas (⋮⋮) à esquerda de cada tarefa e sessão permite arrastar para mudar a ordem. Também dá para focar na alça (Tab) e usar as setas ↑ ↓. A tarefa só se move dentro da própria sessão, e ao mover uma sessão as tarefas dela vão juntas.
- **Prioridade:** a bolinha à direita de cada tarefa troca de cor a cada clique: sem prioridade, verde (tranquila), amarelo (média) e vermelho (urgente).
- **Lembretes:** a cada 30 minutos chega uma notificação com a hora atual e as tarefas que ainda faltam, organizadas por sessão e com as mais urgentes primeiro.
- **Atalhos de teclado:** `Ctrl + F` abre o campo de nova tarefa e `Ctrl + D` abre o de nova sessão, já com o cursor pronto para digitar.
- **Salvamento automático:** tudo é guardado no `localStorage` e continua lá depois de fechar ou recarregar a página.
- **Tema:** segue o modo claro ou escuro do sistema, com cores pastel em rosa, azul e amarelo.

## Arquivos

| Arquivo | Para que serve |
| --- | --- |
| `App.jsx` | Componente com toda a lógica e a interface |
| `App.css` | Estilos e cores do site |

## Como usar no seu projeto React

1. Coloque `App.jsx` e `App.css` na pasta `src/`, no lugar dos que o Vite cria.
2. O `main.jsx` do Vite já importa o `App`, então não precisa mudar nada. O `App.jsx` já importa o `App.css` sozinho.

Se você ainda não tem um projeto React, uma forma rápida de criar um é com o Vite:

```bash
npm create vite@latest meu-checklist -- --template react
cd meu-checklist
npm install
```

Depois copie os dois arquivos para `src/`, e rode:

```bash
npm run dev
```

O site abre em `http://localhost:5173`. O Vite já vem com um `index.css` que pode interferir no visual. Se algo ficar estranho, apague o import de `index.css` no `main.jsx`.

## Atalhos de teclado

| Atalho | O que faz |
| --- | --- |
| `Ctrl + F` (ou `Cmd + F` no Mac) | Abre o campo de nova tarefa |
| `Ctrl + D` (ou `Cmd + D` no Mac) | Abre o campo de nova sessão |
| `Enter` | Adiciona e mantém o campo aberto para a próxima |
| `Esc` | Fecha o campo |

Esses atalhos substituem a busca na página (`Ctrl + F`) e o "favoritar" (`Ctrl + D`) do navegador apenas neste site. Para usar outras teclas, altere as constantes `ATALHO_TAREFA` e `ATALHO_SESSAO` no topo do `App.jsx`.

## Notificações

Para ativar, clique em **Ativar lembretes** no fim da página e permita as notificações quando o navegador perguntar.

- Funcionam apenas em `localhost` ou em um site com `https`. Abrir o arquivo direto do computador (`file://`) não funciona.
- A aba precisa ficar aberta, mesmo em segundo plano. Se fechar a aba, os lembretes param.
- Se não houver nenhuma tarefa pendente, nenhuma notificação é enviada.
- O botão **Testar agora** mostra como a notificação aparece.
- Se você bloqueou as notificações, libere pelo cadeado ao lado do endereço do site e recarregue a página.
- O modo "Não perturbe" ou "Assistente de foco" do sistema pode silenciar as notificações.

## Onde ficam os dados

Tudo é salvo no `localStorage` do navegador, com estas chaves:

| Chave | Conteúdo |
| --- | --- |
| `checklist:tarefas` | Lista de tarefas |
| `checklist:divisoes` | Lista de sessões |
| `checklist:eventos` | Eventos do calendário |
| `checklist:rotinas` | Tarefas que se repetem |
| `checklist:notificar` | Se os lembretes estão ativados |
| `checklist:ultimaNotificacao` | Hora da última notificação enviada |

Formato dos dados:

```js
// tarefa
{ id: 1712345678.9, texto: "Comprar pão", feita: false, meio: false, grupoId: null, prioridade: 0 }
// prioridade: 0 = sem, 1 = verde, 2 = amarelo, 3 = vermelho
// grupoId: id da sessão, ou null se a tarefa estiver solta

// sessão
{ id: 1712345999.1, nome: "Afazeres do RPG", aberta: true }
```

**Cuidados:**
- Os dados ficam só naquele navegador e naquele computador. Outro navegador, outro computador ou uma janela anônima começam com a lista vazia.
- Limpar os dados do site ou o cache do navegador apaga a lista. Se tiver algo importante, anote em outro lugar.

## Personalização

- **Intervalo dos lembretes:** altere a constante `INTERVALO` no topo do `App.jsx` (o valor é em milissegundos, `30 * 60 * 1000` equivale a 30 minutos).
- **Cores:** estão no começo do `App.css`, no bloco `:root`. O bloco `@media (prefers-color-scheme: dark)` logo abaixo define as cores do modo escuro.
- **Cores das prioridades:** variáveis `--prio-verde`, `--prio-amarelo` e `--prio-vermelho`.
- **Largura da coluna:** propriedade `max-width` da classe `.ck`.

## Como funcionam os lembretes

O componente confere a cada 30 segundos se já se passaram 30 minutos desde a última notificação. Por isso, ao recarregar a página ele não manda uma notificação repetida logo em seguida, e se o navegador atrasar o relógio com a aba em segundo plano, o lembrete chega assim que possível.

## Possíveis melhorias

- Mover uma tarefa de uma sessão para outra.
- Renomear sessões.
- Definir horário de início e fim dos lembretes.
- Exportar e importar a lista em um arquivo, para fazer backup.
