import { useEffect, useRef, useState } from "react";
import "./App.css";

const STORAGE_TASKS = "checklist:tarefas";
const STORAGE_GROUPS = "checklist:divisoes";
const STORAGE_LAST = "checklist:ultimaNotificacao";
const STORAGE_NOTIFY = "checklist:notificar";

// Atalhos: Ctrl (ou Cmd no Mac) + a tecla abaixo
const ATALHO_TAREFA = "f";
const ATALHO_SESSAO = "d";

const STORAGE_EVENTS = "checklist:eventos";
const STORAGE_ROUTINES = "checklist:rotinas";

const OPCOES_REPETE = [
  [0, "Não repete"],
  [1, "Todo dia"],
  [2, "A cada 2 dias"],
  [3, "A cada 3 dias"],
  [7, "Toda semana"],
  [14, "A cada 2 semanas"],
  [30, "A cada 30 dias"],
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const z2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
function somarDias(dataISO, n) {
  const [a, m, d] = dataISO.split("-").map(Number);
  return iso(new Date(a, m - 1, d + n));
}
const rotuloRepete = (n) =>
  n === 1 ? "todo dia" : n === 7 ? "toda semana" : `a cada ${n} dias`;
const rotuloRotina = (n, hora) =>
  rotuloRepete(n) + (hora && hora !== "00:00" ? ` às ${hora}` : "");

// meia hora do relógio em que estamos: "2026-10-07 21:30"
function slotAtual() {
  const a = new Date();
  return `${iso(a)} ${z2(a.getHours())}:${a.getMinutes() < 30 ? "00" : "30"}`;
}

// link que abre o evento já preenchido no Google Agenda
function linkGoogle(e) {
  const f = (d) => iso(d).replaceAll("-", "") + `T${z2(d.getHours())}${z2(d.getMinutes())}00`;
  let datas;
  if (e.hora) {
    const ini = new Date(`${e.data}T${e.hora}`);
    datas = `${f(ini)}/${f(new Date(ini.getTime() + 3600000))}`;
  } else {
    datas = `${e.data.replaceAll("-", "")}/${somarDias(e.data, 1).replaceAll("-", "")}`;
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.titulo)}&dates=${datas}` +
    (e.endereco ? `&location=${encodeURIComponent(e.endereco)}` : "") +
    (e.descricao ? `&details=${encodeURIComponent(e.descricao)}` : "");
}

/* Horário em 24 horas, digitado livremente (as setas ↑ ↓ também funcionam) */
function Hora24({ value, onChange, rotulo, opcional }) {
  const inicio = value ? value.split(":") : ["", ""];
  const [h, setH] = useState(inicio[0]);
  const [m, setM] = useState(inicio[1]);
  const refH = useRef(null);
  const refM = useRef(null);
  const levarAoMinuto = useRef(false);

  const juntar = (hh, mm) =>
    hh === ""
      ? ""
      : `${z2(Math.min(23, Number(hh)))}:${z2(mm === "" ? 0 : Math.min(59, Number(mm)))}`;

  // se o formulário trocar o valor por fora (ex.: foi limpo), acompanha
  useEffect(() => {
    if (value !== juntar(h, m)) {
      const [a, b] = value ? value.split(":") : ["", ""];
      setH(a);
      setM(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // depois de atualizar, foca os minutos com o cursor no fim (sem selecionar o dígito já digitado)
  useEffect(() => {
    if (levarAoMinuto.current) {
      levarAoMinuto.current = false;
      const el = refM.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const limpar = (texto, max) => {
    let x = texto.replace(/\D/g, "").slice(0, 2);
    if (x.length === 2 && Number(x) > max) x = String(max);
    return x;
  };

  function digitarHora(e) {
    const bruto = e.target.value.replace(/\D/g, "").slice(0, 2);
    // 24 a 29 não existem: o 2º dígito já é o começo dos minutos (25 vira 02h e minutos 5_)
    if (bruto.length === 2 && bruto[0] === "2" && Number(bruto[1]) > 3) {
      const dig = bruto[1];
      const min = Number(dig) > 5 ? "0" + dig : dig;
      setH("02");
      setM(min);
      onChange(juntar("02", min));
      levarAoMinuto.current = true;
      return;
    }
    let t = limpar(e.target.value, 23);
    if (t.length === 1 && Number(t) > 2) t = "0" + t; // 3 a 9 só podem ser a hora inteira
    setH(t);
    onChange(juntar(t, m));
    if (t.length === 2) refM.current.focus(); // pula para os minutos
  }

  function digitarMinuto(e) {
    let t = limpar(e.target.value, 59);
    if (t.length === 1 && Number(t) > 5) t = "0" + t;
    const hh = h === "" && t !== "" ? "00" : h;
    setH(hh);
    setM(t);
    onChange(juntar(hh, t));
  }

  // ao sair do campo, completa com zero (7 vira 07)
  function sairHora(e) {
    const t = e.target.value;
    if (t === "") {
      if (opcional) {
        setM("");
        onChange("");
      } else {
        setH("00");
        onChange(juntar("00", m));
      }
      return;
    }
    const pronto = t.padStart(2, "0");
    setH(pronto);
    onChange(juntar(pronto, m));
  }

  function sairMinuto(e) {
    if (h === "") return;
    const pronto = (e.target.value || "00").padStart(2, "0");
    setM(pronto);
    onChange(juntar(h, pronto));
  }

  function mexer(delta, max, atual, aplicar) {
    aplicar(z2((((Number(atual) || 0) + delta) % max + max) % max));
  }

  const selecionar = {
    onFocus: (e) => e.target.select(), // clicar ou entrar no campo seleciona tudo: é só digitar por cima
    onMouseUp: (e) => e.preventDefault(),
  };

  return (
    <span className="ck-hora24" role="group" aria-label={rotulo} title={rotulo}>
      <input
        ref={refH}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={h}
        placeholder={opcional ? "--" : "00"}
        aria-label={`${rotulo} - hora`}
        onChange={digitarHora}
        onBlur={sairHora}
        {...selecionar}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            mexer(e.key === "ArrowUp" ? 1 : -1, 24, h, (n) => {
              setH(n);
              onChange(juntar(n, m));
            });
          } else if (e.key === ":") {
            e.preventDefault();
            if (h !== "") setH(h.padStart(2, "0"));
            refM.current.focus();
          }
        }}
      />
      <span aria-hidden="true">:</span>
      <input
        ref={refM}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={m}
        placeholder={opcional ? "--" : "00"}
        aria-label={`${rotulo} - minuto`}
        onChange={digitarMinuto}
        onBlur={sairMinuto}
        {...selecionar}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            mexer(e.key === "ArrowUp" ? 1 : -1, 60, m, (n) => {
              const hh = h === "" ? "00" : h;
              setH(hh);
              setM(n);
              onChange(juntar(hh, n));
            });
          } else if (e.key === "Backspace" && e.target.value === "") {
            e.preventDefault();
            refH.current.focus(); // apagou os minutos: volta para a hora
          }
        }}
      />
    </span>
  );
}

/* Calendário do mês com eventos */
function Calendario({ eventos, adicionar, apagar }) {
  const hojeISO = iso(new Date());
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sel, setSel] = useState(hojeISO);
  const [abrindo, setAbrindo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");

  const ano = mes.getFullYear();
  const m = mes.getMonth();
  const vazios = new Date(ano, m, 1).getDay();
  const total = new Date(ano, m + 1, 0).getDate();
  const comEvento = new Set(eventos.map((e) => e.data));
  const doDia = eventos
    .filter((e) => e.data === sel)
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

  function enviar(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    adicionar({
      titulo: titulo.trim(),
      data: sel,
      hora,
      endereco: endereco.trim(),
      descricao: descricao.trim(),
    });
    setTitulo("");
    setHora("");
    setEndereco("");
    setDescricao("");
  }

  return (
    <section className="ck-cal">
      <div className="ck-cal-topo">
        <button type="button" className="ck-cal-nav" aria-label="Mês anterior" onClick={() => setMes(new Date(ano, m - 1, 1))}>‹</button>
        <strong>{MESES[m]} de {ano}</strong>
        <button type="button" className="ck-cal-nav" aria-label="Próximo mês" onClick={() => setMes(new Date(ano, m + 1, 1))}>›</button>
      </div>

      <div className="ck-cal-grade">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <span key={i} className="ck-cal-sem">{d}</span>
        ))}
        {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: total }, (_, i) => {
          const id = iso(new Date(ano, m, i + 1));
          return (
            <button
              key={id}
              type="button"
              className={`ck-dia${id === hojeISO ? " hoje" : ""}${id === sel ? " sel" : ""}`}
              aria-pressed={id === sel}
              aria-label={`Dia ${i + 1}`}
              onClick={() => setSel(id)}
            >
              {i + 1}
              {comEvento.has(id) && <i />}
            </button>
          );
        })}
      </div>

      <h3 className="ck-cal-data">
        {new Date(`${sel}T00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
      </h3>

      {doDia.length === 0 ? (
        <p className="ck-vazio-cal">Nenhum evento neste dia.</p>
      ) : (
        <ul className="ck-eventos">
          {doDia.map((e) => (
            <li key={e.id}>
              <span className="ck-ev-hora">{e.hora || "dia todo"}</span>
              <span className="ck-ev-titulo">
                {e.titulo}
                {e.endereco && (
                  <a
                    className="ck-ev-info ck-ev-mapa"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.endereco)}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir no Google Maps"
                  >
                    📍 {e.endereco}
                  </a>
                )}
                {e.descricao && <span className="ck-ev-info ck-ev-desc">{e.descricao}</span>}
              </span>
              <a className="ck-apagar" href={linkGoogle(e)} target="_blank" rel="noreferrer" title="Abrir no Google Agenda">Google</a>
              <button type="button" className="ck-apagar" onClick={() => apagar(e.id)} aria-label={`Apagar ${e.titulo}`}>Apagar</button>
            </li>
          ))}
        </ul>
      )}

      {abrindo ? (
        <form
          className="ck-form-grupo"
          onSubmit={enviar}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && !titulo.trim()) setAbrindo(false);
          }}
        >
          <input
            id="campo-evento"
            type="text"
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAbrindo(false)}
            placeholder="Novo evento"
            aria-label="Título do evento"
            maxLength={100}
          />
          <Hora24 value={hora} onChange={setHora} opcional rotulo="Horário do evento (opcional)" />
          <input
            type="text"
            className="ck-campo-largo"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAbrindo(false)}
            placeholder="Endereço (opcional)"
            aria-label="Endereço"
            maxLength={200}
          />
          <textarea
            className="ck-campo-largo"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAbrindo(false)}
            placeholder="Descrição (opcional)"
            aria-label="Descrição"
            rows={2}
            maxLength={500}
          />
          <button type="submit" disabled={!titulo.trim()}>Adicionar</button>
        </form>
      ) : (
        <BarraMais rotulo="Adicionar evento" onClick={() => setAbrindo(true)} />
      )}
    </section>
  );
}

/* Lista das tarefas que se repetem */
function Rotinas({ rotinas, apagar, mudarPrioridade }) {
  if (rotinas.length === 0) return null;
  return (
    <section className="ck-rotinas">
      <h3>Rotinas</h3>
      <ul>
        {rotinas.map((r) => (
          <li key={r.id}>
            <span className="ck-rot-texto">
              {r.texto}
              <span className="ck-rot-info">
                ↻ {rotuloRotina(r.cada, r.hora)} · próxima em {r.proxima.split("-").reverse().slice(0, 2).join("/")} às {r.hora || "00:00"}
              </span>
            </span>
            <button
              type="button"
              className={`ck-prio p${r.prioridade || 0}`}
              onClick={() => mudarPrioridade(r.id)}
              title={`Prioridade ao voltar: ${PRIORIDADES[r.prioridade || 0].nome} (clique para trocar)`}
              aria-label={`Prioridade ao voltar: ${PRIORIDADES[r.prioridade || 0].nome}. Clique para trocar.`}
            />
            <button type="button" className="ck-apagar" onClick={() => apagar(r.id)} aria-label={`Apagar rotina ${r.texto}`}>Apagar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    hourCycle: "h23",
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
function BarraMais({ rotulo, onClick, atalho }) {
  return (
    <button type="button" className="ck-barra-mais" onClick={onClick}>
      <span className="ck-mais" aria-hidden="true">
        <IconeMais />
      </span>
      <span>{rotulo}</span>
      {atalho && <kbd className="ck-atalho">Ctrl {atalho.toUpperCase()}</kbd>}
    </button>
  );
}

/* Campo para escrever uma tarefa nova (usado fora e dentro das sessões) */
function NovaTarefa({ onAdd, placeholder, onFechar, idCampo }) {
  const [texto, setTexto] = useState("");
  const [repete, setRepete] = useState("0");
  const [hora, setHora] = useState("00:00");

  function enviar(e) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return;
    onAdd(limpo, Number(repete), hora || "00:00");
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
        id={idCampo}
        type="text"
        value={texto}
        autoFocus
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onFechar && onFechar()}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={200}
      />
      <select
        value={repete}
        onChange={(e) => setRepete(e.target.value)}
        aria-label="Repetir tarefa"
        title="Repetir esta tarefa"
      >
        {OPCOES_REPETE.map(([v, nome]) => (
          <option key={v} value={v}>{v ? `↻ ${nome}` : nome}</option>
        ))}
      </select>
      {repete !== "0" && (
        <Hora24 value={hora} onChange={setHora} rotulo="Horário em que a tarefa volta" />
      )}
      <button type="submit" disabled={!texto.trim()}>
        Adicionar
      </button>
    </form>
  );
}

/* Alça com bolinhas: arraste ou use as setas ↑ ↓ com ela em foco */
function Alca({ id, tipo, grupo, ordem, imagem }) {
  return (
    <span
      role="button"
      tabIndex={0}
      id={`alca-${id}`}
      className="ck-alca"
      draggable
      title="Arraste para reordenar (ou use as setas ↑ ↓)"
      aria-label="Reordenar: arraste ou use as setas para cima e para baixo"
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(id));
        const el = e.currentTarget.closest(imagem);
        if (el) e.dataTransfer.setDragImage(el, 0, 0);
        setTimeout(() => ordem.setArrastando({ tipo, id, grupo }), 0);
      }}
      onDragEnd={ordem.fim}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          ordem.moverPor(tipo, id, e.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" fill="currentColor">
        {[3, 8, 13].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
      </svg>
    </span>
  );
}

// Só aceita soltar item do mesmo tipo e do mesmo grupo (tarefa não sai da sessão)
function alvoProps(ordem, tipo, id, grupo) {
  const ok = () => {
    const a = ordem.arrastando;
    return a && a.tipo === tipo && a.id !== id && a.grupo === grupo;
  };
  return {
    onDragOver: (e) => {
      if (ok()) {
        e.preventDefault();
        ordem.setSobre(id);
      }
    },
    onDrop: (e) => {
      if (!ok()) return;
      e.preventDefault();
      ordem.mover(tipo, ordem.arrastando.id, id);
      ordem.fim();
    },
  };
}

/* Formulário para editar uma tarefa já criada */
function EditarTarefa({ tarefa, onSalvar, onCancelar }) {
  const [texto, setTexto] = useState(tarefa.texto);
  const [repete, setRepete] = useState(String(tarefa.repeteDias || 0));
  const [hora, setHora] = useState(tarefa.repeteHora || "00:00");

  return (
    <form
      className="ck-form-grupo"
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) onSalvar(texto.trim(), Number(repete), hora || "00:00");
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
    >
      <input
        type="text"
        value={texto}
        autoFocus
        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Nome da tarefa"
        maxLength={200}
      />
      <select value={repete} onChange={(e) => setRepete(e.target.value)} aria-label="Repetir tarefa">
        {OPCOES_REPETE.map(([v, nome]) => (
          <option key={v} value={v}>{v ? `↻ ${nome}` : nome}</option>
        ))}
      </select>
      {repete !== "0" && (
        <Hora24 value={hora} onChange={setHora} rotulo="Horário em que a tarefa volta" />
      )}
      <span className="ck-edit-acoes">
        <button type="submit" disabled={!texto.trim()}>Salvar</button>
        <button
          type="button"
          className="ck-icone"
          onClick={onCancelar}
          title="Cancelar (Esc)"
          aria-label="Cancelar edição"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </span>
    </form>
  );
}

/* Lista de tarefas (usada fora e dentro das sessões) */
function ListaTarefas({ tarefas, alternar, apagar, mudarPrioridade, ordem, edicao }) {
  return (
    <ul className="ck-lista">
      {tarefas.map((t) => edicao.id === t.id ? (
        <li key={t.id} className="editando">
          <EditarTarefa tarefa={t} onSalvar={(texto, dias, hora) => edicao.salvar(t.id, texto, dias, hora)} onCancelar={edicao.cancelar} />
        </li>
      ) : (
        <li
          key={t.id}
          className={`${t.feita ? "feita" : ""}${ordem.arrastando?.id === t.id ? " arrastando" : ""}${ordem.sobre === t.id && ordem.arrastando?.tipo === "tarefa" ? " alvo" : ""}`}
          {...alvoProps(ordem, "tarefa", t.id, t.grupoId || null)}
        >
          <Alca id={t.id} tipo="tarefa" grupo={t.grupoId || null} ordem={ordem} imagem="li" />
          <label
            title={t.feita ? "Feita" : t.meio ? "Meio feita" : "Pendente"}
          >
            <input
              type="checkbox"
              checked={t.feita}
              ref={(el) => {
                // "meio check" aparece como estado indeterminado
                if (el) el.indeterminate = !!t.meio && !t.feita;
              }}
              onChange={() => alternar(t.id)}
            />
            <span className="ck-caixa" aria-hidden="true" />
            <span className="ck-texto">{t.texto}</span>
            {t.repeteDias > 0 && (
              <span className="ck-repete" title="Volta sozinha, mesmo se você apagar">↻ {rotuloRotina(t.repeteDias, t.repeteHora)}</span>
            )}
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
            className="ck-icone"
            onClick={() => edicao.abrir(t.id)}
            title="Editar tarefa"
            aria-label={`Editar ${t.texto}`}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" />
            </svg>
          </button>
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

export default function App() {
  const [tarefas, setTarefas] = useState(() => lerStorage(STORAGE_TASKS, []));
  const [grupos, setGrupos] = useState(() => lerStorage(STORAGE_GROUPS, []));
  const [eventos, setEventos] = useState(() => lerStorage(STORAGE_EVENTS, []));
  const [rotinas, setRotinas] = useState(() => lerStorage(STORAGE_ROUTINES, []));
  const [editando, setEditando] = useState(null); // id da tarefa em edição
  const [arrastando, setArrastando] = useState(null); // {tipo, id, grupo}
  const [sobre, setSobre] = useState(null);
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
  const eventosRef = useRef([]);
  const rotinasRef = useRef([]);
  tarefasRef.current = tarefas;
  gruposRef.current = grupos;
  eventosRef.current = eventos;
  rotinasRef.current = rotinas;

  useEffect(() => {
    salvarStorage(STORAGE_TASKS, tarefas);
  }, [tarefas]);

  useEffect(() => {
    salvarStorage(STORAGE_GROUPS, grupos);
  }, [grupos]);

  useEffect(() => {
    salvarStorage(STORAGE_EVENTS, eventos);
  }, [eventos]);

  useEffect(() => {
    salvarStorage(STORAGE_ROUTINES, rotinas);
  }, [rotinas]);

  // Rotinas: quando chega o dia, a tarefa volta (mesmo se você apagou a anterior)
  useEffect(() => {
    function gerar() {
      const agora = new Date();
      const hoje = iso(agora);
      const hm = `${z2(agora.getHours())}:${z2(agora.getMinutes())}`;
      // vence no dia marcado, a partir do horário da rotina (padrão: meia-noite)
      const vencida = (r) =>
        r.proxima < hoje || (r.proxima === hoje && hm >= (r.hora || "00:00"));
      const devidas = rotinasRef.current.filter(vencida);
      if (devidas.length === 0) return;

      // avisa as que realmente vão voltar (as que ainda estão pendentes não voltam de novo)
      const voltam = devidas.filter(
        (r) => !tarefasRef.current.some((t) => t.rotinaId === r.id && !t.feita)
      );
      if (
        voltam.length > 0 &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        lerStorage(STORAGE_NOTIFY, false)
      ) {
        new Notification(`Tarefa de volta · ${horaAtual()}`, {
          body: voltam.map((r) => `• ${r.texto}`).join("\n"),
          tag: "checklist-rotina",
          renotify: true,
        });
      }

      setTarefas((atual) => [
        ...atual,
        ...devidas
          .filter((r) => !atual.some((t) => t.rotinaId === r.id && !t.feita))
          .map((r) => ({
            id: novoId(), texto: r.texto, feita: false, meio: false,
            grupoId: r.grupoId, prioridade: r.prioridade || 0,
            rotinaId: r.id, repeteDias: r.cada, repeteHora: r.hora || "00:00",
          })),
      ]);
      setRotinas((atual) =>
        atual.map((r) => (vencida(r) ? { ...r, proxima: somarDias(hoje, r.cada) } : r))
      );
    }

    gerar();
    const id = setInterval(gerar, 60 * 1000);
    document.addEventListener("visibilitychange", gerar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", gerar);
    };
  }, []);

  useEffect(() => {
    salvarStorage(STORAGE_NOTIFY, notificar);
  }, [notificar]);

  // Atalhos de teclado: abrem o campo e já deixam o cursor nele
  useEffect(() => {
    function aoApertar(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const tecla = e.key.toLowerCase();

      if (tecla === ATALHO_TAREFA) {
        e.preventDefault(); // impede a busca do navegador
        setCriandoSolta(true);
        // se o campo já estava aberto, só devolve o foco a ele
        document.getElementById("campo-tarefa")?.focus();
      } else if (tecla === ATALHO_SESSAO) {
        e.preventDefault(); // impede o "favoritar" do navegador
        setCriandoGrupo(true);
        document.getElementById("campo-sessao")?.focus();
      }
    }

    window.addEventListener("keydown", aoApertar);
    return () => window.removeEventListener("keydown", aoApertar);
  }, []);

  const idsGrupos = new Set(grupos.map((g) => g.id));
  // Tarefas sem sessão (ou de uma sessão que não existe mais)
  const soltas = tarefas.filter((t) => !t.grupoId || !idsGrupos.has(t.grupoId));
  const pendentes = tarefas.filter((t) => !t.feita);
  const feitas = tarefas.length - pendentes.length;
  const meias = pendentes.filter((t) => t.meio).length;

  function enviarNotificacao() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const todas = tarefasRef.current.filter((t) => !t.feita);
    const agora = new Date();
    const hm = `${z2(agora.getHours())}:${z2(agora.getMinutes())}`;
    const evs = eventosRef.current
      .filter((e) => e.data === iso(agora) && (!e.hora || e.hora >= hm))
      .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
    if (todas.length === 0 && evs.length === 0) return;

    const linhas = [];

    // todas as pendentes juntas, das mais urgentes para as menos urgentes
    const nomeGrupo = new Map(gruposRef.current.map((g) => [g.id, g.nome]));
    [...todas]
      .sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0))
      .forEach((t) => {
        const sessao = nomeGrupo.get(t.grupoId);
        linhas.push(
          `• ${PRIORIDADES[t.prioridade || 0].marca}${t.texto}${t.meio ? " (meio feita)" : ""}${sessao ? ` · ${sessao}` : ""}`
        );
      });

    if (evs.length) {
      linhas.push("Hoje na agenda:");
      evs.forEach((e) =>
        linhas.push(`  • ${e.hora ? e.hora + " " : ""}${e.titulo}${e.endereco ? ` (${e.endereco})` : ""}`)
      );
    }

    new Notification(`Checklist · ${horaAtual()}`, {
      body: `${todas.length ? `Faltam ${todas.length}:\n` : ""}${linhas.join("\n")}`,
      tag: "checklist-pendentes", // substitui a notificação anterior
      renotify: true, // sem isso, a substituta chega em silêncio
    });
  }

  // Confere a cada 30s se entrou uma nova meia hora do relógio (21:00, 21:30...)
  useEffect(() => {
    if (!notificar || permissao !== "granted") return;

    const checar = () => {
      const slot = slotAtual();
      if (lerStorage(STORAGE_LAST, "") === slot) return; // essa meia hora já foi avisada
      salvarStorage(STORAGE_LAST, slot);
      // só avisa nos primeiros 5 min da meia hora, para não mostrar aviso velho
      if (new Date().getMinutes() % 30 < 5) enviarNotificacao();
    };

    checar();
    const id = setInterval(checar, 30 * 1000);
    // ao voltar para a aba, recupera um lembrete que ficou atrasado
    document.addEventListener("visibilitychange", checar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", checar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificar, permissao]);

  async function ativarNotificacoes() {
    if (typeof Notification === "undefined") return;

    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermissao(p);

    if (p === "granted") {
      salvarStorage(STORAGE_LAST, slotAtual()); // começa a avisar na próxima meia hora
      setNotificar(true);
    }
  }

  /* tarefas */
  function adicionarTarefa(texto, grupoId = null, repetirDias = 0, hora = "00:00") {
    let rotinaId;
    if (repetirDias > 0) {
      rotinaId = novoId();
      setRotinas((atual) => [
        ...atual,
        { id: rotinaId, texto, cada: repetirDias, hora, grupoId, prioridade: 0,
          proxima: somarDias(iso(new Date()), repetirDias) },
      ]);
    }
    setTarefas((atual) => [
      ...atual,
      { id: novoId(), texto, feita: false, grupoId, rotinaId, repeteDias: repetirDias, repeteHora: hora },
    ]);
  }

  function adicionarEvento(ev) {
    setEventos((atual) => [...atual, { id: novoId(), ...ev }]);
  }

  function apagarEvento(id) {
    setEventos((atual) => atual.filter((e) => e.id !== id));
  }

  function apagarRotina(id) {
    setRotinas((atual) => atual.filter((r) => r.id !== id));
  }

  function alternar(id) {
    // pendente → meio feita → feita → pendente
    setTarefas((atual) =>
      atual.map((t) => {
        if (t.id !== id) return t;
        if (t.feita) return { ...t, feita: false, meio: false };
        if (t.meio) return { ...t, feita: true, meio: false };
        return { ...t, meio: true };
      })
    );
  }

  function mudarPrioridade(id) {
    // sem prioridade → verde → amarelo → vermelho → sem prioridade
    const t = tarefas.find((x) => x.id === id);
    if (!t) return;
    const nova = ((t.prioridade || 0) + 1) % 4;
    setTarefas((a) => a.map((x) => (x.id === id ? { ...x, prioridade: nova } : x)));
    // se a tarefa se repete, ela já volta da próxima vez com essa prioridade
    if (t.rotinaId) {
      setRotinas((a) => a.map((r) => (r.id === t.rotinaId ? { ...r, prioridade: nova } : r)));
    }
  }

  function mudarPrioridadeRotina(id) {
    setRotinas((a) =>
      a.map((r) => (r.id === id ? { ...r, prioridade: ((r.prioridade || 0) + 1) % 4 } : r))
    );
  }

  function apagar(id) {
    setTarefas((atual) => atual.filter((t) => t.id !== id));
  }

  /* ordem: mover item para a posição de outro (mesma lista) */
  function moverItem(setLista, idA, idB) {
    setLista((atual) => {
      const de = atual.findIndex((x) => x.id === idA);
      const para = atual.findIndex((x) => x.id === idB);
      if (de < 0 || para < 0 || de === para) return atual;
      const copia = [...atual];
      const [item] = copia.splice(de, 1);
      copia.splice(para, 0, item);
      return copia;
    });
  }

  function mover(tipo, idA, idB) {
    moverItem(tipo === "grupo" ? setGrupos : setTarefas, idA, idB);
  }

  function moverPor(tipo, id, delta) {
    let irmaos;
    if (tipo === "grupo") {
      irmaos = grupos;
    } else {
      const t = tarefas.find((x) => x.id === id);
      if (!t) return;
      irmaos = tarefas.filter((x) => (x.grupoId || null) === (t.grupoId || null));
    }
    const alvo = irmaos[irmaos.findIndex((x) => x.id === id) + delta];
    if (!alvo) return;
    mover(tipo, id, alvo.id);
    // o React move o elemento de lugar e o foco se perde: devolve ele
    requestAnimationFrame(() => document.getElementById(`alca-${id}`)?.focus());
  }

  const ordem = {
    arrastando,
    sobre,
    setArrastando,
    setSobre,
    fim: () => {
      setArrastando(null);
      setSobre(null);
    },
    mover,
    moverPor,
  };

  /* editar: nome, repetição e horário de uma tarefa que já existe */
  function salvarEdicao(id, texto, dias, hora) {
    const t = tarefas.find((x) => x.id === id);
    if (!t) return;
    const rotina = rotinas.find((r) => r.id === t.rotinaId);
    let rotinaId = null;

    if (dias > 0 && rotina) {
      rotinaId = rotina.id; // já repetia: atualiza nome, intervalo e horário
      setRotinas((a) =>
        a.map((r) =>
          r.id === rotina.id
            ? { ...r, texto, cada: dias, hora, proxima: dias === r.cada ? r.proxima : somarDias(iso(new Date()), dias) }
            : r
        )
      );
    } else if (dias > 0) {
      rotinaId = novoId(); // passou a repetir
      setRotinas((a) => [
        ...a,
        { id: rotinaId, texto, cada: dias, hora, grupoId: t.grupoId || null, prioridade: t.prioridade || 0, proxima: somarDias(iso(new Date()), dias) },
      ]);
    } else if (rotina) {
      setRotinas((a) => a.filter((r) => r.id !== rotina.id)); // parou de repetir
    }

    setTarefas((a) =>
      a.map((x) => (x.id === id ? { ...x, texto, repeteDias: dias, repeteHora: dias > 0 ? hora : undefined, rotinaId } : x))
    );
    setEditando(null);
  }

  const edicao = { id: editando, abrir: setEditando, cancelar: () => setEditando(null), salvar: salvarEdicao };

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
    <div className="ck-layout">
    <main className="ck">
      <header className="ck-topo">
        <h1>Tarefas</h1>
        <span className="ck-contagem">
          {tarefas.length === 0
            ? "Nenhuma tarefa"
            : `${feitas} de ${tarefas.length} concluídas${
                meias > 0 ? ` · ${meias} pela metade` : ""
              }`}
        </span>
      </header>

      {criandoSolta ? (
        <NovaTarefa
          idCampo="campo-tarefa"
          placeholder="Nova tarefa"
          onAdd={(texto, rep, hora) => adicionarTarefa(texto, null, rep, hora)}
          onFechar={() => setCriandoSolta(false)}
        />
      ) : (
        <BarraMais
          rotulo="Adicionar tarefa"
          atalho={ATALHO_TAREFA}
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
            id="campo-sessao"
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
          atalho={ATALHO_SESSAO}
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
          ordem={ordem}
          edicao={edicao}
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
          <section
            key={g.id}
            className={`ck-grupo${arrastando?.id === g.id ? " arrastando" : ""}${sobre === g.id && arrastando?.tipo === "grupo" ? " alvo" : ""}`}
            {...alvoProps(ordem, "grupo", g.id, null)}
          >
            <div className="ck-grupo-topo">
              <Alca id={g.id} tipo="grupo" grupo={null} ordem={ordem} imagem=".ck-grupo-topo" />
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
                    onAdd={(texto, rep, hora) => adicionarTarefa(texto, g.id, rep, hora)}
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
          ordem={ordem}
          edicao={edicao}
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
                ? "Lembrete ativo: toda hora cheia e meia hora (21:00, 21:30, 22:00...) você recebe as tarefas que faltam."
                : "Receba as tarefas pendentes toda hora cheia e meia hora (21:00, 21:30...)."}
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

    <aside className="ck-lateral">
      <Calendario eventos={eventos} adicionar={adicionarEvento} apagar={apagarEvento} />
      <Rotinas rotinas={rotinas} apagar={apagarRotina} mudarPrioridade={mudarPrioridadeRotina} />
    </aside>
    </div>
  );
}
