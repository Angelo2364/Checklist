import { useEffect, useRef, useState } from "react";
import "./App.css";

const STORAGE_TASKS = "checklist:tarefas";
const STORAGE_GROUPS = "checklist:divisoes";
const STORAGE_LAST = "checklist:ultimaNotificacao";
const STORAGE_NOTIFY = "checklist:notificar";
const INTERVALO = 30 * 60 * 1000; // 30 minutos

function lerStorage(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

function salvarStorage(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* storage cheio ou bloqueado: ignora */
  }
}

function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PRIORIDADES = [
  { nome: "Sem prioridade", marca: "" },
  { nome: "Tranquila", marca: "🟢 " },
  { nome: "Média", marca: "🟡 " },
  { nome: "Urgente", marca: "🔴 " },
];

function novoId() {
  return Date.now() + Math.random();
}

/* "+" desenhado em SVG para ficar sempre centralizado */
function IconeMais() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 2.5v11M2.5 8h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* Barra fina com o "+" e um rótulo (abre o campo ao clicar) */
function BarraMais({ rotulo, onClick }) {
  return (
    <button type="button" className="ck-barra-mais" onClick={onClick}>
      <span className="ck-mais" aria-hidden="true">
        <IconeMais />
      </span>
      <span>{rotulo}</span>
    </button>
  );
}

/* Campo para escrever uma tarefa nova (usado fora e dentro das sessões) */
function NovaTarefa({ onAdd, placeholder, onFechar }) {
  const [texto, setTexto] = useState("");

  function enviar(e) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return;
    onAdd(limpo);
    setTexto("");
  }

  return (
    <form
      className="ck-form-grupo"
      onSubmit={enviar}
      onBlur={(e) => {
        // saiu do formulário e não digitou nada: fecha
        if (!e.currentTarget.contains(e.relatedTarget) && !texto.trim()) {
          onFechar && onFechar();
        }
      }}
    >
      <input
        type="text"
        value={texto}
        autoFocus
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onFechar && onFechar()}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={200}
      />
      <button type="submit" disabled={!texto.trim()}>
        Adicionar
      </button>
    </form>
  );
}

/* Lista de tarefas (usada fora e dentro das sessões) */
function ListaTarefas({ tarefas, alternar, apagar, mudarPrioridade }) {
  return (
    <ul className="ck-lista">
      {tarefas.map((t) => (
        <li key={t.id} className={t.feita ? "feita" : ""}>
          <label>
            <input
              type="checkbox"
              checked={t.feita}
              onChange={() => alternar(t.id)}
            />
            <span className="ck-caixa" aria-hidden="true" />
            <span className="ck-texto">{t.texto}</span>
          </label>
          <button
            type="button"
            className={`ck-prio p${t.prioridade || 0}`}
            onClick={() => mudarPrioridade(t.id)}
            title={`${PRIORIDADES[t.prioridade || 0].nome} (clique para trocar)`}
            aria-label={`Prioridade: ${PRIORIDADES[t.prioridade || 0].nome}. Clique para trocar.`}
          />
          <button
            type="button"
            className="ck-apagar"
            onClick={() => apagar(t.id)}
            aria-label={`Apagar ${t.texto}`}
          >
            Apagar
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Checklist() {
  const [tarefas, setTarefas] = useState(() => lerStorage(STORAGE_TASKS, []));
  const [grupos, setGrupos] = useState(() => lerStorage(STORAGE_GROUPS, []));
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [criandoSolta, setCriandoSolta] = useState(false);
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const [grupoAdd, setGrupoAdd] = useState(null); // sessão com campo aberto
  const [notificar, setNotificar] = useState(() =>
    lerStorage(STORAGE_NOTIFY, false)
  );
  const [permissao, setPermissao] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  // Mantém os dados atuais acessíveis dentro do setInterval
  const tarefasRef = useRef([]);
  const gruposRef = useRef([]);
  tarefasRef.current = tarefas;
  gruposRef.current = grupos;

  useEffect(() => {
    salvarStorage(STORAGE_TASKS, tarefas);
  }, [tarefas]);

  useEffect(() => {
    salvarStorage(STORAGE_GROUPS, grupos);
  }, [grupos]);

  useEffect(() => {
    salvarStorage(STORAGE_NOTIFY, notificar);
  }, [notificar]);

  const idsGrupos = new Set(grupos.map((g) => g.id));
  // Tarefas sem sessão (ou de uma sessão que não existe mais)
  const soltas = tarefas.filter((t) => !t.grupoId || !idsGrupos.has(t.grupoId));
  const pendentes = tarefas.filter((t) => !t.feita);
  const feitas = tarefas.length - pendentes.length;

  function enviarNotificacao() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const todas = tarefasRef.current.filter((t) => !t.feita);
    if (todas.length === 0) return;

    const ids = new Set(gruposRef.current.map((g) => g.id));
    const linhas = [];

    const maisUrgentePrimeiro = (a, b) =>
      (b.prioridade || 0) - (a.prioridade || 0);
    const linha = (t) => `${PRIORIDADES[t.prioridade || 0].marca}${t.texto}`;

    todas
      .filter((t) => !t.grupoId || !ids.has(t.grupoId))
      .sort(maisUrgentePrimeiro)
      .forEach((t) => linhas.push(`• ${linha(t)}`));

    gruposRef.current.forEach((g) => {
      const doGrupo = todas
        .filter((t) => t.grupoId === g.id)
        .sort(maisUrgentePrimeiro);
      if (doGrupo.length === 0) return;
      linhas.push(`${g.nome}:`);
      doGrupo.forEach((t) => linhas.push(`  • ${linha(t)}`));
    });

    new Notification(`Checklist · ${horaAtual()}`, {
      body: `Faltam ${todas.length}:\n${linhas.join("\n")}`,
      tag: "checklist-pendentes", // substitui a notificação anterior
    });
    salvarStorage(STORAGE_LAST, Date.now());
  }

  // Confere a cada 30s se já passaram 30 min desde a última notificação
  useEffect(() => {
    if (!notificar || permissao !== "granted") return;

    const checar = () => {
      const ultima = lerStorage(STORAGE_LAST, 0);
      if (Date.now() - ultima >= INTERVALO) enviarNotificacao();
    };

    checar();
    const id = setInterval(checar, 30 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificar, permissao]);

  async function ativarNotificacoes() {
    if (typeof Notification === "undefined") return;

    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermissao(p);

    if (p === "granted") {
      salvarStorage(STORAGE_LAST, 0);
      setNotificar(true);
    }
  }

  /* tarefas */
  function adicionarTarefa(texto, grupoId = null) {
    setTarefas((atual) => [
      ...atual,
      { id: novoId(), texto, feita: false, grupoId },
    ]);
  }

  function alternar(id) {
    setTarefas((atual) =>
      atual.map((t) => (t.id === id ? { ...t, feita: !t.feita } : t))
    );
  }

  function mudarPrioridade(id) {
    // sem prioridade → verde → amarelo → vermelho → sem prioridade
    setTarefas((atual) =>
      atual.map((t) =>
        t.id === id ? { ...t, prioridade: ((t.prioridade || 0) + 1) % 4 } : t
      )
    );
  }

  function apagar(id) {
    setTarefas((atual) => atual.filter((t) => t.id !== id));
  }

  function limparFeitas() {
    setTarefas((atual) => atual.filter((t) => !t.feita));
  }

  /* sessões */
  function criarGrupo(e) {
    e.preventDefault();
    const limpo = nomeGrupo.trim();
    if (!limpo) return;
    setGrupos((atual) => [...atual, { id: novoId(), nome: limpo, aberta: true }]);
    setNomeGrupo("");
    setCriandoGrupo(false);
  }

  function abrirAddTarefa(grupo) {
    // abre o campo e garante que a sessão esteja expandida
    setGrupoAdd((atual) => (atual === grupo.id ? null : grupo.id));
    if (grupo.aberta === false) alternarGrupo(grupo.id);
  }

  function alternarGrupo(id) {
    setGrupos((atual) =>
      atual.map((g) => (g.id === id ? { ...g, aberta: g.aberta === false } : g))
    );
  }

  function apagarGrupo(grupo) {
    const qtd = tarefas.filter((t) => t.grupoId === grupo.id).length;
    const aviso =
      qtd > 0
        ? `Apagar a sessão "${grupo.nome}" e as ${qtd} tarefas dentro dela?`
        : `Apagar a sessão "${grupo.nome}"?`;
    if (!window.confirm(aviso)) return;
    setGrupos((atual) => atual.filter((g) => g.id !== grupo.id));
    setTarefas((atual) => atual.filter((t) => t.grupoId !== grupo.id));
  }

  const ativo = notificar && permissao === "granted";

  return (
    <main className="ck">
      <header className="ck-topo">
        <h1>Tarefas</h1>
        <span className="ck-contagem">
          {tarefas.length === 0
            ? "Nenhuma tarefa"
            : `${feitas} de ${tarefas.length} concluídas`}
        </span>
      </header>

      {criandoSolta ? (
        <NovaTarefa
          placeholder="Nova tarefa"
          onAdd={(texto) => adicionarTarefa(texto, null)}
          onFechar={() => setCriandoSolta(false)}
        />
      ) : (
        <BarraMais
          rotulo="Adicionar tarefa"
          onClick={() => setCriandoSolta(true)}
        />
      )}

      {criandoGrupo ? (
        <form
          className="ck-nova-divisao"
          onSubmit={criarGrupo}
          onBlur={(e) => {
            if (
              !e.currentTarget.contains(e.relatedTarget) &&
              !nomeGrupo.trim()
            ) {
              setCriandoGrupo(false);
            }
          }}
        >
          <input
            type="text"
            value={nomeGrupo}
            autoFocus
            onChange={(e) => setNomeGrupo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setCriandoGrupo(false);
                setNomeGrupo("");
              }
            }}
            placeholder="Nome da sessão (ex: Afazeres do RPG)"
            aria-label="Nome da nova sessão"
            maxLength={60}
          />
          <button type="submit" disabled={!nomeGrupo.trim()}>
            Criar
          </button>
        </form>
      ) : (
        <BarraMais
          rotulo="Adicionar sessão"
          onClick={() => setCriandoGrupo(true)}
        />
      )}

      {grupos.length > 0 && soltas.length > 0 && (
        <h2 className="ck-secao">Sem sessão</h2>
      )}

      {soltas.length > 0 && (
        <ListaTarefas
          tarefas={soltas}
          alternar={alternar}
          apagar={apagar}
          mudarPrioridade={mudarPrioridade}
        />
      )}

      {tarefas.length === 0 && grupos.length === 0 && (
        <p className="ck-vazio">
          Use as faixas acima para adicionar uma tarefa ou criar uma sessão.
        </p>
      )}

      {grupos.map((g) => {
        const doGrupo = tarefas.filter((t) => t.grupoId === g.id);
        const feitasGrupo = doGrupo.filter((t) => t.feita).length;
        const aberta = g.aberta !== false;

        return (
          <section key={g.id} className="ck-grupo">
            <div className="ck-grupo-topo">
              <button
                type="button"
                className="ck-grupo-titulo"
                onClick={() => alternarGrupo(g.id)}
                aria-expanded={aberta}
              >
                <span className={`ck-seta ${aberta ? "aberta" : ""}`}>›</span>
                <span className="ck-grupo-nome">{g.nome}</span>
                <span className="ck-grupo-qtd">
                  {feitasGrupo}/{doGrupo.length}
                </span>
              </button>
              <button
                type="button"
                className="ck-mais"
                onClick={() => abrirAddTarefa(g)}
                onMouseDown={(e) => e.preventDefault()}
                title="Nova tarefa nesta sessão"
                aria-label={`Nova tarefa em ${g.nome}`}
                aria-expanded={grupoAdd === g.id}
              >
                <IconeMais />
              </button>
              <button
                type="button"
                className="ck-apagar"
                onClick={() => apagarGrupo(g)}
                aria-label={`Apagar sessão ${g.nome}`}
              >
                Apagar sessão
              </button>
            </div>

            {aberta && (
              <>
                {grupoAdd === g.id && (
                  <NovaTarefa
                    placeholder={`Nova tarefa em ${g.nome}`}
                    onAdd={(texto) => adicionarTarefa(texto, g.id)}
                    onFechar={() => setGrupoAdd(null)}
                  />
                )}
                {doGrupo.length === 0 ? (
                  <p className="ck-vazio-grupo">Nenhuma tarefa aqui ainda.</p>
                ) : (
                  <ListaTarefas
                    tarefas={doGrupo}
                    alternar={alternar}
                    apagar={apagar}
                    mudarPrioridade={mudarPrioridade}
                  />
                )}
              </>
            )}
          </section>
        );
      })}

      {feitas > 0 && (
        <button type="button" className="ck-link" onClick={limparFeitas}>
          Limpar concluídas
        </button>
      )}

      <section className="ck-aviso">
        {permissao === "unsupported" && (
          <p>Seu navegador não suporta notificações.</p>
        )}

        {permissao === "denied" && (
          <p>
            As notificações estão bloqueadas. Libere nas configurações do site
            (ícone de cadeado na barra de endereço) e recarregue a página.
          </p>
        )}

        {permissao !== "unsupported" && permissao !== "denied" && (
          <>
            <p>
              {ativo
                ? "Lembrete ativo: a cada 30 minutos você recebe as tarefas que faltam e a hora."
                : "Receba as tarefas pendentes e a hora a cada 30 minutos."}
            </p>
            <div className="ck-acoes">
              {ativo ? (
                <>
                  <button type="button" onClick={() => setNotificar(false)}>
                    Desativar lembretes
                  </button>
                  <button
                    type="button"
                    className="secundario"
                    onClick={enviarNotificacao}
                  >
                    Testar agora
                  </button>
                </>
              ) : (
                <button type="button" onClick={ativarNotificacoes}>
                  Ativar lembretes
                </button>
              )}
            </div>
            {ativo && (
              <small>
                Deixe esta aba aberta (pode ficar em segundo plano) para os
                lembretes continuarem chegando.
              </small>
            )}
          </>
        )}
      </section>
    </main>
  );
}
