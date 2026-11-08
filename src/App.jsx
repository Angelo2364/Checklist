import { useEffect, useRef, useState } from "react";
import "./App.css";
import { supabase } from "./services/supabase";
import { carregarDados, criarDados, salvarDados } from "./services/dados";
import { pushSuportado, motivoSemPush, ativarPush, atualizarPush, desativarPush } from "./services/push";
import Login, { NovaSenha } from "./Login";

const STORAGE_TASKS = "checklist:tarefas";
const STORAGE_GROUPS = "checklist:divisoes";
const STORAGE_NOTES = "checklist:anotacoes";
const STORAGE_NOTE_GROUPS = "checklist:sessoesAnotacoes";
const STORAGE_LAST = "checklist:ultimaNotificacao";
const STORAGE_NOTIFY = "checklist:notificar";

// Atalhos: Ctrl (ou Cmd no Mac) + a tecla abaixo
const ATALHO_TAREFA = "f";
const ATALHO_SESSAO = "d";

const STORAGE_EVENTS = "checklist:eventos";
const STORAGE_ROUTINES = "checklist:rotinas";
const STORAGE_BILLS = "checklist:contas";
const STORAGE_PRAZOS = "checklist:avisosPrazo";
const STORAGE_BG = "checklist:fundo";
const STORAGE_BLUR = "checklist:desfoqueFundo"; // chave nova: o padrão agora é 10px
const DESFOQUE_PADRAO = 10;
const NOME_RODAPE = "Moony"; // aparece no rodapé; ao passar o mouse mostra o nome secreto
const NOME_SECRETO = "Luna";
const EMAIL_CONTATO = "sayaokaua@gmail.com";
const STORAGE_INTERVALO = "checklist:intervaloAviso"; // minutos entre os lembretes
const INTERVALOS_AVISO = [15, 30, 60, 120, 180];
const rotuloIntervalo = (m) => (m < 60 ? `${m} minutos` : m === 60 ? "1 hora" : `${m / 60} horas`);
const STORAGE_TEMA = "checklist:tema"; // "escuro" (padrão) | "claro"
const FORMATO_BACKUP = "checklist-backup"; // marca dos arquivos exportados
const STORAGE_DONO = "checklist:donoLocal"; // id do usuário a quem pertence o cache local

// o que vai pra nuvem (mesma forma do arquivo exportado, sem o cabeçalho)
const listaObjs = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const empacotar = (tarefas, grupos, eventos, rotinas, contas, anotacoes = [], sessoesAnotacoes = []) => ({ tarefas, grupos, eventos, rotinas, contas, anotacoes, sessoesAnotacoes });
const empacotarNuvem = (d) =>
  empacotar(listaObjs(d?.tarefas), listaObjs(d?.grupos), listaObjs(d?.eventos), listaObjs(d?.rotinas), listaObjs(d?.contas), listaObjs(d?.anotacoes), listaObjs(d?.sessoesAnotacoes));
// papel de parede padrão: coloque o arquivo bg.png dentro da pasta public/
const FUNDO_PADRAO = `${import.meta.env.BASE_URL}bg.png`;
const STORAGE_BG_AJUSTE = "checklist:ajusteFundo";

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
function enviarAoEnter(e) {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}
function fecharAoClicarFora(e, fechar) {
  const formulario = e.currentTarget;
  window.setTimeout(() => {
    if (!formulario.contains(document.activeElement)) fechar();
  }, 50);
}
const iso = (d) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
function somarDias(dataISO, n) {
  const [a, m, d] = dataISO.split("-").map(Number);
  return iso(new Date(a, m - 1, d + n));
}
const rotuloRepete = (n) =>
  n === 1 ? "todo dia" : n === 7 ? "toda semana" : `a cada ${n} dias`;
const rotuloRotina = (n, hora) =>
  rotuloRepete(n) + (hora && hora !== "00:00" ? ` às ${hora}` : "");

// prazo da tarefa: "até hoje 17:00" e se já passou
function rotuloPrazo(t, agora = new Date()) {
  if (!t.limite) return null;
  const hoje = iso(agora);
  const dia =
    t.limite === hoje ? "hoje" : t.limite === somarDias(hoje, 1) ? "amanhã" : t.limite.split("-").reverse().slice(0, 2).join("/");
  const fim = new Date(`${t.limite}T${t.limiteHora || "23:59"}`);
  return { texto: `até ${dia}${t.limiteHora ? ` ${t.limiteHora}` : ""}`, atrasada: !t.feita && fim < agora };
}

// só tarefas com data E horário recebem os avisos de prazo
const prazoDe = (t) => (t.limite && t.limiteHora ? new Date(`${t.limite}T${t.limiteHora}`) : null);

// três bips, para o aviso mais urgente (o navegador pode bloquear som se você ainda não clicou na página)
function apitar() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + d);
      o.stop(ctx.currentTime + d + 0.2);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* sem som */
  }
}

// meia hora do relógio em que estamos: "2026-10-07 21:30"
function slotAtual(intervalo = 30) {
  const a = new Date();
  const total = a.getHours() * 60 + a.getMinutes();
  const ini = Math.floor(total / intervalo) * intervalo;
  return `${iso(a)} ${z2(Math.floor(ini / 60))}:${z2(ini % 60)}`;
}

// minutos desde o começo do intervalo atual (0 a intervalo-1)
function minutosNoSlot(intervalo = 30) {
  const a = new Date();
  return (a.getHours() * 60 + a.getMinutes()) % intervalo;
}

// link que abre o evento já preenchido no Google Agenda
function linkGoogle(e) {
  const f = (d) => iso(d).replaceAll("-", "") + `T${z2(d.getHours())}${z2(d.getMinutes())}00`;
  let datas;
  if (e.hora) {
    const ini = new Date(`${e.data}T${e.hora}`);
    let fim = new Date(ini.getTime() + 3600000); // sem término: 1 hora
    if (e.horaFim) {
      fim = new Date(`${e.data}T${e.horaFim}`);
      if (fim <= ini) fim = new Date(fim.getTime() + 86400000); // terminou depois da meia-noite
    }
    datas = `${f(ini)}/${f(fim)}`;
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

/* Dia e mês digitados (sem ano): o ano é o próximo em que a data ainda não passou */
function dataDe(dd, mm) {
  const d = Number(dd);
  const m = Number(mm);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let a = hoje.getFullYear(); a <= hoje.getFullYear() + 4; a++) {
    const x = new Date(a, m - 1, d);
    if (x.getMonth() === m - 1 && x.getDate() === d && x >= hoje) return iso(x); // 31/04 não existe → vazio
  }
  return "";
}

function DiaMes({ value, onChange }) {
  const [d, setD] = useState(value ? value.slice(8, 10) : "");
  const [m, setM] = useState(value ? value.slice(5, 7) : "");
  const refD = useRef(null);
  const refM = useRef(null);
  const irParaMes = useRef(false);

  // se dia e mês não mudaram, mantém a data como está (não "pula" para o ano que vem ao editar)
  const calcular = (dd, mm) => {
    if (!dd || !mm) return "";
    if (value && Number(value.slice(8, 10)) === Number(dd) && Number(value.slice(5, 7)) === Number(mm)) return value;
    return dataDe(dd, mm);
  };

  useEffect(() => {
    if (value !== calcular(d, m)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setD(value ? value.slice(8, 10) : "");
      setM(value ? value.slice(5, 7) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (irParaMes.current) {
      irParaMes.current = false;
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

  function digitarDia(e) {
    const bruto = e.target.value.replace(/\D/g, "").slice(0, 2);
    // 32 a 39 não existem: o 2º dígito já é o começo do mês (35 vira dia 03, mês 5_)
    if (bruto.length === 2 && bruto[0] === "3" && Number(bruto[1]) > 1) {
      const mes = "0" + bruto[1];
      setD("03");
      setM(mes);
      onChange(calcular("03", mes));
      irParaMes.current = true;
      return;
    }
    let t = limpar(e.target.value, 31);
    if (t.length === 1 && Number(t) > 3) t = "0" + t; // 4 a 9 só podem ser o dia inteiro
    setD(t);
    onChange(calcular(t, m));
    if (t.length === 2) refM.current.focus();
  }

  function digitarMes(e) {
    let t = limpar(e.target.value, 12);
    if (t.length === 1 && Number(t) > 1) t = "0" + t;
    setM(t);
    onChange(calcular(d, t));
  }

  function sair(e, campo) {
    const t = e.target.value;
    if (!t) return;
    const pronto = t.padStart(2, "0");
    if (campo === "d") {
      setD(pronto);
      onChange(calcular(pronto, m));
    } else {
      setM(pronto);
      onChange(calcular(d, pronto));
    }
  }

  const mexer = (delta, min, max, atual) => {
    const n = Number(atual) || (delta > 0 ? min - 1 : max + 1);
    return z2(((n - min + delta + (max - min + 1)) % (max - min + 1)) + min);
  };

  const selecionar = {
    onFocus: (e) => e.target.select(),
    onMouseUp: (e) => e.preventDefault(),
  };

  return (
    <span className="ck-hora24" role="group" aria-label="Data limite: dia e mês (opcional)" title="Data limite: dia/mês (opcional). O ano é o próximo em que a data ainda não passou.">
      <span className="ck-prazo-rotulo">Prazo</span>
      <input
        ref={refD}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={d}
        placeholder="dd"
        aria-label="Dia limite"
        onChange={digitarDia}
        onBlur={(e) => sair(e, "d")}
        {...selecionar}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = mexer(e.key === "ArrowUp" ? 1 : -1, 1, 31, d);
            setD(n);
            onChange(calcular(n, m));
          } else if (e.key === "/") {
            e.preventDefault();
            if (d) setD(d.padStart(2, "0"));
            refM.current.focus();
          }
        }}
      />
      <span aria-hidden="true">/</span>
      <input
        ref={refM}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={m}
        placeholder="mm"
        aria-label="Mês limite"
        onChange={digitarMes}
        onBlur={(e) => sair(e, "m")}
        {...selecionar}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = mexer(e.key === "ArrowUp" ? 1 : -1, 1, 12, m);
            setM(n);
            onChange(calcular(d, n));
          } else if (e.key === "Backspace" && e.target.value === "") {
            e.preventDefault();
            refD.current.focus();
          }
        }}
      />
    </span>
  );
}

/* Data e horário limite (opcionais) */
function CampoPrazo({ limite, hora, onLimite, onHora }) {
  return (
    <>
      <DiaMes
        value={limite}
        onChange={(v) => {
          onLimite(v);
          if (!v) onHora("");
        }}
      />
      {limite && <Hora24 value={hora} onChange={onHora} opcional rotulo="Horário limite (opcional)" />}
    </>
  );
}

/* Calendário do mês com eventos */
function Calendario({ eventos, adicionar, editar, apagar }) {
  const hojeISO = iso(new Date());
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sel, setSel] = useState(hojeISO);
  const [abrindo, setAbrindo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [editandoId, setEditandoId] = useState(null); // evento sendo editado
  const [dataEdit, setDataEdit] = useState("");

  const ano = mes.getFullYear();
  const m = mes.getMonth();
  const vazios = new Date(ano, m, 1).getDay();
  const total = new Date(ano, m + 1, 0).getDate();
  const comEvento = new Set(eventos.map((e) => e.data));
  const doDia = eventos
    .filter((e) => e.data === sel)
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

  function limparCampos() {
    setTitulo("");
    setHora("");
    setHoraFim("");
    setEndereco("");
    setDescricao("");
  }

  function cancelar() {
    setAbrindo(false);
    setEditandoId(null);
    limparCampos();
  }

  function comecarEdicao(ev) {
    setEditandoId(ev.id);
    setDataEdit(ev.data);
    setTitulo(ev.titulo || "");
    setHora(ev.hora || "");
    setHoraFim(ev.horaFim || "");
    setEndereco(ev.endereco || "");
    setDescricao(ev.descricao || "");
    setAbrindo(true);
  }

  function enviar(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    const campos = {
      titulo: titulo.trim(),
      hora,
      horaFim: hora ? horaFim : "",
      endereco: endereco.trim(),
      descricao: descricao.trim(),
    };
    if (editandoId) {
      const novaData = dataEdit || sel;
      editar(editandoId, { ...campos, data: novaData });
      setSel(novaData);
      cancelar();
      return;
    }
    adicionar({ ...campos, data: sel });
    limparCampos();
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
              <span className="ck-ev-hora">{e.hora ? (e.horaFim ? `${e.hora}–${e.horaFim}` : e.hora) : "dia todo"}</span>
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
              <button type="button" className="ck-icone" onClick={() => comecarEdicao(e)} title="Editar evento" aria-label={`Editar ${e.titulo}`}>
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" />
                </svg>
              </button>
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
            if (!editandoId && !e.currentTarget.contains(e.relatedTarget) && !titulo.trim()) setAbrindo(false);
          }}
        >
          <input
            id="campo-evento"
            type="text"
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancelar()}
            placeholder="Novo evento"
            aria-label="Título do evento"
            maxLength={100}
          />
          <div className="ck-ev-horas">
            <Hora24
              value={hora}
              onChange={(v) => {
                setHora(v);
                if (!v) setHoraFim("");
              }}
              opcional
              rotulo="Começa às (opcional)"
            />
            {hora && <Hora24 value={horaFim} onChange={setHoraFim} opcional rotulo="Termina às (opcional)" />}
          </div>
          <input
            type="text"
            className="ck-campo-largo"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancelar()}
            placeholder="Endereço (opcional)"
            aria-label="Endereço"
            maxLength={200}
          />
          <textarea
            className="ck-campo-largo"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cancelar()}
            placeholder="Descrição (opcional)"
            aria-label="Descrição"
            rows={2}
            maxLength={500}
          />
          {editandoId && (
            <label className="ck-campo-largo ck-ev-dia">
              Dia do evento
              <input type="date" value={dataEdit} onChange={(e) => setDataEdit(e.target.value)} required />
            </label>
          )}
          <button type="submit" disabled={!titulo.trim()}>{editandoId ? "Salvar" : "Adicionar"}</button>
          {editandoId && (
            <button type="button" className="secundario" onClick={cancelar}>Cancelar</button>
          )}
        </form>
      ) : (
        <BarraMais rotulo="Adicionar evento" onClick={() => setAbrindo(true)} />
      )}
    </section>
  );
}

/* Valores em reais: aceita 1.200,50 / 1200,5 / 89.9 */
const BRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function lerValor(t) {
  let x = String(t).replace(/[^\d.,]/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}(\.|$)/.test(x)) x = x.replace(/\./g, ""); // 1.200 = mil e duzentos
  const n = parseFloat(x);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/* Valor da conta: clique para definir ou corrigir */
function ValorConta({ conta, onSalvar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const cancelou = useRef(false);

  function salvar() {
    if (cancelou.current) {
      cancelou.current = false;
    } else {
      onSalvar(lerValor(texto));
    }
    setEditando(false);
  }

  if (editando) {
    return (
      <input
        className="ck-valor-campo"
        type="text"
        inputMode="decimal"
        autoFocus
        value={texto}
        placeholder="0,00"
        aria-label={`Valor de ${conta.nome}`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.target.blur();
          if (e.key === "Escape") {
            cancelou.current = true;
            e.target.blur();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`ck-valor${conta.valor > 0 ? "" : " vazio"}`}
      title="Definir ou corrigir o valor"
      onClick={() => {
        setTexto(conta.valor ? String(conta.valor).replace(".", ",") : "");
        setEditando(true);
      }}
    >
      {conta.valor > 0 ? BRL(conta.valor) : "+ valor"}
    </button>
  );
}

/* Contas recorrentes: vence todo mês no mesmo dia, com parcelas opcionais */
function vencimento(c) {
  const [a, m] = c.ciclo.split("-").map(Number);
  return new Date(a, m - 1, Math.min(c.dia, new Date(a, m, 0).getDate()));
}

function Contas({ contas, adicionar, alternar, apagar, definirValor }) {
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState("");
  const [dia, setDia] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [valor, setValor] = useState("");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const total = contas.reduce((soma, c) => soma + (c.valor || 0), 0);
  const pago = contas.filter((c) => c.pago).reduce((soma, c) => soma + (c.valor || 0), 0);

  function enviar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    adicionar({
      nome: nome.trim(),
      valor: lerValor(valor),
      dia: Math.min(31, Math.max(1, Number(dia) || new Date().getDate())),
      total: Math.max(0, Math.floor(Number(parcelas) || 0)),
    });
    setNome("");
    setDia("");
    setParcelas("");
    setValor("");
  }

  function situacao(c) {
    const dias = Math.round((vencimento(c) - hoje) / 86400000);
    if (c.total > 0 && c.parcela >= c.total && c.pago) return ["Quitada ✓", ""];
    if (c.pago) return ["Paga ✓", ""];
    if (dias < 0) return [`Atrasada há ${-dias} dia${-dias > 1 ? "s" : ""}`, "ck-atraso"];
    if (dias === 0) return ["Vence hoje", "ck-atraso"];
    return [`Vence em ${dias} dia${dias > 1 ? "s" : ""}`, ""];
  }

  return (
    <section className="ck-contas">
      <div className="ck-resumo">
        <span className="ck-resumo-rotulo">Despesas fixas</span>
        <strong className="ck-resumo-valor">{BRL(total)}</strong>
        {total > 0 && (
          <span className="ck-resumo-sub">
            Pago {BRL(pago)} · Falta {BRL(total - pago)}
          </span>
        )}
      </div>
      {contas.length === 0 ? (
        <p className="ck-vazio-cal">Nenhuma conta ainda. Adicione abaixo.</p>
      ) : (
        <ul className="ck-lista">
          {contas.map((c) => {
            const [texto, classe] = situacao(c);
            return (
              <li key={c.id} className={c.pago ? "feita" : ""}>
                <label>
                  <input type="checkbox" checked={c.pago} onChange={() => alternar(c.id)} />
                  <span className="ck-caixa" aria-hidden="true" />
                  <span className="ck-conta-corpo">
                    <span className="ck-texto">{c.nome}</span>
                    <span className="ck-rot-info">
                      dia {c.dia}{c.total > 0 ? ` · parcela ${c.parcela}/${c.total}` : ""}
                    </span>
                    <span className={`ck-rot-info ck-vencimento ${classe}`}>{texto}</span>
                  </span>
                </label>
                <ValorConta conta={c} onSalvar={(v) => definirValor(c.id, v)} />
                <button type="button" className="ck-apagar" onClick={() => apagar(c.id)} aria-label={`Apagar conta ${c.nome}`}>Apagar</button>
              </li>
            );
          })}
        </ul>
      )}

      {abrindo ? (
        <form
          className="ck-form-grupo"
          onSubmit={enviar}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && !nome.trim()) setAbrindo(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && setAbrindo(false)}
        >
          <input
            type="text"
            className="ck-campo-largo"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da conta (ex: Internet)"
            aria-label="Nome da conta"
            maxLength={80}
          />
          <input type="text" inputMode="decimal" className="ck-num ck-num-v" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" aria-label="Valor da conta" title="Valor da conta em reais (opcional)" />
          <input type="number" className="ck-num" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="Vence dia" aria-label="Dia do mês em que vence" title="Dia do mês em que vence (vazio = hoje)" />
          <input type="number" className="ck-num ck-num-p" min="1" max="999" value={parcelas} onChange={(e) => setParcelas(e.target.value)} placeholder="Parcelas" aria-label="Número de parcelas (opcional)" title="Número de parcelas (opcional; vazio = sem fim)" />
          <button type="submit" disabled={!nome.trim()}>Adicionar</button>
        </form>
      ) : (
        <BarraMais rotulo="Adicionar conta" onClick={() => setAbrindo(true)} />
      )}
    </section>
  );
}

/* Lista das tarefas que se repetem */
function Rotinas({ rotinas, apagar, mudarPrioridade }) {
  if (rotinas.length === 0) {
    return (
      <section className="ck-rotinas">
        <p className="ck-vazio-cal">Nenhuma tarefa recorrente. Ao criar uma tarefa, escolha "Repetir".</p>
      </section>
    );
  }
  return (
    <section className="ck-rotinas">
      <ul>
        {rotinas.map((r) => (
          <li key={r.id}>
            <span className="ck-rot-texto">
              {r.texto}
              <span className="ck-rot-info">↻ {rotuloRotina(r.cada, r.hora)}</span>
              <span className="ck-rot-info ck-vencimento">Próxima em {r.proxima.split("-").reverse().slice(0, 2).join("/")} às {r.hora || "00:00"}</span>
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

// aplica o tema salvo antes de desenhar a tela (evita piscar)
if (typeof document !== "undefined") {
  const salvo = lerStorage(STORAGE_TEMA, "escuro");
  document.documentElement.dataset.tema = salvo === "claro" ? "claro" : "escuro";
}

// papel de parede: guardado no IndexedDB como o arquivo original (sem recomprimir),
// porque o localStorage tem limite de ~5 MB e obrigava a reduzir/comprimir a imagem
const DB_NOME = "checklist-db";
const DB_LOJA = "arquivos";
const DB_CHAVE_FUNDO = "fundo";

function abrirDB() {
  return new Promise((ok, erro) => {
    const rq = indexedDB.open(DB_NOME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(DB_LOJA);
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => erro(rq.error);
  });
}

async function dbLer(chave) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const rq = db.transaction(DB_LOJA).objectStore(DB_LOJA).get(chave);
    rq.onsuccess = () => ok(rq.result ?? null);
    rq.onerror = () => erro(rq.error);
  });
}

async function dbSalvar(chave, valor) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const tx = db.transaction(DB_LOJA, "readwrite");
    tx.objectStore(DB_LOJA).put(valor, chave);
    tx.oncomplete = () => ok();
    tx.onerror = () => erro(tx.error);
  });
}

async function dbApagar(chave) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const tx = db.transaction(DB_LOJA, "readwrite");
    tx.objectStore(DB_LOJA).delete(chave);
    tx.oncomplete = () => ok();
    tx.onerror = () => erro(tx.error);
  });
}

// Notificação que funciona no celular: o Android não aceita `new Notification()`,
// só `registration.showNotification()` através de um Service Worker.
async function mostrarNotificacao(titulo, opcoes = {}) {
  try {
    if ("serviceWorker" in navigator) {
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
      await navigator.serviceWorker.ready;
      await reg.showNotification(titulo, { icon: `${import.meta.env.BASE_URL}pwa-192.png`, ...opcoes });
      return;
    }
  } catch {
    /* cai no jeito antigo abaixo */
  }
  try {
    new Notification(titulo, { icon: `${import.meta.env.BASE_URL}pwa-192.png`, ...opcoes });
  } catch {
    /* sem suporte */
  }
}

// Email do rodapé: clicar copia o endereço (nem todo computador tem programa de email configurado,
// e nesses o mailto: não faz nada)
function Contato() {
  const [copiado, setCopiado] = useState(false);

  async function copiar(e) {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(EMAIL_CONTATO);
    } catch {
      window.location.href = `mailto:${EMAIL_CONTATO}`; // sem permissão pra copiar: tenta abrir o programa de email
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <a href={`mailto:${EMAIL_CONTATO}`} onClick={copiar} title="Clique para copiar o email">
      {copiado ? "email copiado ✓" : EMAIL_CONTATO}
    </a>
  );
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
  const [limite, setLimite] = useState("");
  const [limiteHora, setLimiteHora] = useState("");
  const [descricao, setDescricao] = useState("");

  function enviar(e) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return;
    onAdd(limpo, Number(repete), hora || "00:00", { limite, limiteHora, descricao });
    setTexto("");
    setLimite("");
    setLimiteHora("");
    setDescricao("");
  }

  return (
    <form
      className="ck-form-grupo"
      onSubmit={enviar}
      onBlur={(e) => fecharAoClicarFora(e, () => onFechar && onFechar())}
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
      <CampoPrazo limite={limite} hora={limiteHora} onLimite={setLimite} onHora={setLimiteHora} />
      <textarea
        className="ck-campo-largo"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onFechar && onFechar(); else enviarAoEnter(e); }}
        placeholder="Observações (opcional)"
        aria-label="Observações da tarefa"
        rows={2}
        maxLength={1000}
      />
      <button type="submit" disabled={!texto.trim()}>
        Adicionar
      </button>
    </form>
  );
}

/* Alça com bolinhas: arraste ou use as setas ↑ ↓ com ela em foco */
function Alca({ id, tipo, grupo, ordem, imagem }) {
  return (
    <>
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
          ordem.moverPor(tipo, id, e.key === "ArrowUp" ? -1 : 1, grupo);
        }
      }}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" fill="currentColor">
        {[3, 8, 13].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
      </svg>
    </span>
    </>
  );
}

// Só aceita soltar item do mesmo tipo e do mesmo grupo (tarefa não sai da sessão)
function alvoProps(ordem, tipo, id, grupo) {
  const ok = () => {
    const a = ordem.arrastando;
    if (!a || a.id === id) return false;
    if (a.tipo === tipo) return true;
    return (tipo === "grupo" && a.tipo === "tarefa") || (tipo === "sessaoAnotacao" && a.tipo === "anotacao") || (tipo === "destinoTarefas" && a.tipo === "tarefa") || (tipo === "destinoAnotacoes" && a.tipo === "anotacao");
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
      const destino = tipo === "grupo" || tipo === "sessaoAnotacao" ? id : tipo === "destinoTarefas" || tipo === "destinoAnotacoes" ? null : grupo;
      ordem.mover(ordem.arrastando.tipo, ordem.arrastando.id, id, destino);
      ordem.fim();
    },
  };
}

/* Formulário para editar uma tarefa já criada */
function EditarTarefa({ tarefa, onSalvar, onCancelar }) {
  const [texto, setTexto] = useState(tarefa.texto);
  const [repete, setRepete] = useState(String(tarefa.repeteDias || 0));
  const [hora, setHora] = useState(tarefa.repeteHora || "00:00");
  const [limite, setLimite] = useState(tarefa.limite || "");
  const [limiteHora, setLimiteHora] = useState(tarefa.limiteHora || "");
  const [descricao, setDescricao] = useState(tarefa.descricao || "");

  return (
    <form
      className="ck-form-grupo"
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) onSalvar(texto.trim(), Number(repete), hora || "00:00", { limite, limiteHora, descricao });
      }}
      onBlur={(e) => fecharAoClicarFora(e, onCancelar)}
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
      <CampoPrazo limite={limite} hora={limiteHora} onLimite={setLimite} onHora={setLimiteHora} />
      <textarea
        className="ck-campo-largo"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); else enviarAoEnter(e); }}
        placeholder="Observações (opcional)"
        aria-label="Observações da tarefa"
        rows={2}
        maxLength={1000}
      />
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
function ToggleDescricao({ fechada, onClick }) {
  return <button type="button" className="ck-descricao-toggle" aria-label={fechada ? "Mostrar descrição" : "Ocultar descrição"} title={fechada ? "Mostrar descrição" : "Ocultar descrição"} aria-expanded={!fechada} onClick={onClick}><svg className={`ck-descricao-seta${fechada ? "" : " aberta"}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 6 4.5 4.5L12.5 6" /></svg></button>;
}

function EditarNomeSessao({ sessao, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(sessao.nome);
  return <form className="ck-editar-sessao" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) onSalvar(nome.trim()); }} onBlur={(e) => fecharAoClicarFora(e, onCancelar)} onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); }}>
    <input autoFocus type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required aria-label="Nome da sessão" />
    <button type="submit" className="ck-icone" title="Salvar nome da sessão" aria-label="Salvar nome da sessão" disabled={!nome.trim()}><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3.2 3.2L13 4.5" /></svg></button>
    <button type="button" className="ck-icone" title="Cancelar" aria-label="Cancelar edição do nome" onClick={onCancelar}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9m0-9-9 9" /></svg></button>
  </form>;
}

function ListaTarefas({ tarefas, alternar, apagar, mudarPrioridade, ordem, edicao }) {
  const [descricoesFechadas, setDescricoesFechadas] = useState({});
  return (
    <ul className="ck-lista">
      {tarefas.map((t) => edicao.id === t.id ? (
        <li key={t.id} className="editando">
          <EditarTarefa tarefa={t} onSalvar={(texto, dias, hora, prazo) => edicao.salvar(t.id, texto, dias, hora, prazo)} onCancelar={edicao.cancelar} />
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
            <span className="ck-corpo">
              <span className="ck-texto">{t.texto}</span>
              {(t.repeteDias > 0 || t.limite) && (
                <span className="ck-meta">
                  {t.repeteDias > 0 && (
                    <span className="ck-repete" title="Volta sozinha, mesmo se você apagar">↻ {rotuloRotina(t.repeteDias, t.repeteHora)}</span>
                  )}
                  {t.limite && (() => {
                    const pz = rotuloPrazo(t);
                    return (
                      <span className={`ck-prazo${pz.atrasada ? " ck-atraso" : ""}`} title="Prazo">
                        ⏰ {pz.atrasada ? "atrasada · " : ""}{pz.texto}
                      </span>
                    );
                  })()}
                </span>
              )}
              {t.descricao && !descricoesFechadas[t.id] && <span className="ck-descricao">{t.descricao}</span>}
            </span>
          </label>
          {t.descricao && <ToggleDescricao fechada={descricoesFechadas[t.id]} onClick={() => setDescricoesFechadas((atual) => ({ ...atual, [t.id]: !atual[t.id] }))} />}
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

function FormularioAnotacao({ form, onSalvar, onChange, onCancelar }) {
  return (
    <form className="ck-form-grupo ck-form-anotacao" onSubmit={onSalvar} onBlur={(e) => fecharAoClicarFora(e, onCancelar)}>
      <input id="campo-titulo-anotacao" autoFocus type="text" maxLength={100} placeholder="Título" aria-label="Título da anotação" value={form.titulo} onChange={(e) => onChange((atual) => ({ ...atual, titulo: e.target.value }))} required />
      <input type="date" aria-label="Data da anotação" value={form.data} onChange={(e) => onChange((atual) => ({ ...atual, data: e.target.value }))} required />
      <textarea className="ck-campo-largo" rows={4} placeholder="Anotação (opcional)" aria-label="Anotação (opcional)" value={form.texto} onChange={(e) => onChange((atual) => ({ ...atual, texto: e.target.value }))} onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); else enviarAoEnter(e); }} />
      <button type="submit" disabled={!form.titulo.trim()}>Salvar</button>
      <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
    </form>
  );
}

function ConfiguracoesVisuais({ tema, setTema, desfoque, setDesfoque, ajusteFundo, setAjusteFundo, escolherFundo, fundo, removerFundo, erroFundo }) {
  return <div className="ck-config-preferencias">
    <section className="ck-pref-card">
      <h3>Tema</h3>
      <p>Escolha como a checklist aparece neste navegador.</p>
      <span className="ck-ajuste ck-ajuste-segmentado" role="group" aria-label="Tema">
        {[['escuro', 'Tema escuro'], ['claro', 'Tema claro']].map(([v, nome]) => <button key={v} type="button" className={`secundario ck-ajuste-btn${tema === v ? ' ativo' : ''}`} aria-pressed={tema === v} onClick={() => setTema(v)}>{nome}</button>)}
      </span>
    </section>
    <section className="ck-pref-card">
      <h3>Imagem de fundo</h3>
      <p>A imagem e o desfoque ficam salvos só neste navegador.</p>
      <label className="ck-arquivo"><input type="file" accept="image/*" onChange={escolherFundo} /><span>Escolher imagem</span></label>
      <label className="ck-desfoque">
        <span>Desfoque</span><input type="range" min="0" max="20" value={desfoque} style={{ "--ck-range-progresso": `${desfoque * 5}%` }} onChange={(e) => setDesfoque(Number(e.target.value))} /><output>{desfoque}px</output>
      </label>
      <div className="ck-pref-encaixe"><strong>Encaixe da imagem</strong><span className="ck-ajuste ck-ajuste-segmentado" role="group" aria-label="Ajuste da imagem">
        {[['preencher', 'Preencher', 'Cobre a tela toda (corta as bordas se a proporção for diferente)'], ['inteira', 'Inteira', 'Mostra a imagem inteira, sem cortar']].map(([v, nome, dica]) => <button key={v} type="button" className={`secundario ck-ajuste-btn${ajusteFundo === v ? ' ativo' : ''}`} aria-pressed={ajusteFundo === v} title={dica} onClick={() => setAjusteFundo(v)}>{nome}</button>)}
      </span></div>
      {fundo && <button type="button" className="secundario" onClick={removerFundo}>Voltar ao padrão</button>}
      {erroFundo && <p className="ck-erro">{erroFundo}</p>}
    </section>
  </div>;
}

function Checklist({ usuario }) {
  const [tarefas, setTarefas] = useState(() => lerStorage(STORAGE_TASKS, []));
  const [grupos, setGrupos] = useState(() => lerStorage(STORAGE_GROUPS, []));
  const [eventos, setEventos] = useState(() => lerStorage(STORAGE_EVENTS, []));
  const [rotinas, setRotinas] = useState(() => lerStorage(STORAGE_ROUTINES, []));
  const [contas, setContas] = useState(() => lerStorage(STORAGE_BILLS, []));
  const [anotacoes, setAnotacoes] = useState(() => lerStorage(STORAGE_NOTES, []));
  const [sessoesAnotacoes, setSessoesAnotacoes] = useState(() => lerStorage(STORAGE_NOTE_GROUPS, []));
  const [pagina, setPagina] = useState("tarefas");
  const [abaConfiguracoes, setAbaConfiguracoes] = useState("preferencias");
  const paginaRef = useRef(pagina);
  paginaRef.current = pagina;
  const [nomeSessaoAnotacao, setNomeSessaoAnotacao] = useState("");
  const [criandoSessaoAnotacao, setCriandoSessaoAnotacao] = useState(false);
  const [formAnotacao, setFormAnotacao] = useState(null);
  const [descricoesAnotacaoFechadas, setDescricoesAnotacaoFechadas] = useState({});
  const [aba, setAba] = useState("rotinas");
  const [fundo, setFundo] = useState(null); // URL (blob:) do papel de parede, carregado do IndexedDB
  const [desfoque, setDesfoque] = useState(() => lerStorage(STORAGE_BLUR, DESFOQUE_PADRAO));
  const [ajusteFundo, setAjusteFundo] = useState(() => lerStorage(STORAGE_BG_AJUSTE, "preencher"));
  const [pushAtivo, setPushAtivo] = useState(false); // este aparelho recebe avisos do servidor (app fechado)
  const [avisoPush, setAvisoPush] = useState("");
  const [intervaloAviso, setIntervaloAviso] = useState(() => {
    const v = lerStorage(STORAGE_INTERVALO, 30);
    return INTERVALOS_AVISO.includes(v) ? v : 30;
  });
  const [tema, setTema] = useState(() => (lerStorage(STORAGE_TEMA, "escuro") === "claro" ? "claro" : "escuro"));
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    salvarStorage(STORAGE_TEMA, tema);
  }, [tema]);
  const [msgDados, setMsgDados] = useState({ texto: "", erro: false });
  const [, setTick] = useState(0);
  const [erroFundo, setErroFundo] = useState("");
  const [editando, setEditando] = useState(null); // id da tarefa em edição
  const [arrastando, setArrastando] = useState(null); // {tipo, id, grupo}
  const [sobre, setSobre] = useState(null);
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [sessaoEmEdicao, setSessaoEmEdicao] = useState(null);
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
  const contasRef = useRef([]);
  const anotacoesRef = useRef([]);
  const sessoesAnotacoesRef = useRef([]);
  tarefasRef.current = tarefas;
  gruposRef.current = grupos;
  eventosRef.current = eventos;
  rotinasRef.current = rotinas;
  contasRef.current = contas;
  anotacoesRef.current = anotacoes;
  sessoesAnotacoesRef.current = sessoesAnotacoes;

  // ---------- sincronização com o Supabase ----------
  const [sync, setSync] = useState("carregando"); // carregando | salvo | salvando | erro | conflito | erro-carregar
  const [nuvemPronta, setNuvemPronta] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const versaoNuvem = useRef(null); // updated_at da última versão que este aparelho viu ou salvou
  const jsonSalvo = useRef(""); // conteúdo da última versão sincronizada
  const salvandoAgora = useRef(false);
  const bloqueado = useRef(false); // true enquanto há conflito pendente

  const jsonAtual = JSON.stringify(empacotar(tarefas, grupos, eventos, rotinas, contas, anotacoes, sessoesAnotacoes));
  const jsonAtualRef = useRef(jsonAtual);
  jsonAtualRef.current = jsonAtual;

  function aplicarDados(d) {
    const l = empacotarNuvem(d);
    setTarefas(l.tarefas);
    setGrupos(l.grupos);
    setEventos(l.eventos);
    setRotinas(l.rotinas);
    setContas(l.contas);
    setAnotacoes(l.anotacoes);
    setSessoesAnotacoes(l.sessoesAnotacoes);
    return JSON.stringify(l);
  }

  // carga inicial: a nuvem manda; conta nova sobe o que já existir neste aparelho
  useEffect(() => {
    let cancelado = false;
    // Mostra o estado de carga imediatamente ao trocar de conta ou tentar novamente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSync("carregando");
    (async () => {
      try {
        const nuvem = await carregarDados(usuario.id);
        if (cancelado) return;
        if (nuvem) {
          jsonSalvo.current = aplicarDados(nuvem.data);
          versaoNuvem.current = nuvem.updated_at;
        } else {
          // cache local de outra conta nunca sobe pra esta
          const dono = lerStorage(STORAGE_DONO, null);
          const inicial = dono && dono !== usuario.id
            ? empacotar([], [], [], [], [], [], [])
            : empacotar(tarefasRef.current, gruposRef.current, eventosRef.current, rotinasRef.current, contasRef.current, anotacoesRef.current, sessoesAnotacoesRef.current);
          jsonSalvo.current = aplicarDados(inicial);
          try {
            versaoNuvem.current = await criarDados(usuario.id, inicial);
          } catch (err) {
            if (err?.code !== "23505") throw err;
            // outro aparelho criou a linha agora há pouco: usa a dele
            const outra = await carregarDados(usuario.id);
            jsonSalvo.current = aplicarDados(outra.data);
            versaoNuvem.current = outra.updated_at;
          }
        }
        if (cancelado) return;
        salvarStorage(STORAGE_DONO, usuario.id);
        bloqueado.current = false;
        setNuvemPronta(true);
        setSync("salvo");
      } catch {
        if (!cancelado) setSync("erro-carregar");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [usuario.id, tentativa]);

  async function salvarNaNuvem(forcar = false) {
    while (salvandoAgora.current) await new Promise((r) => setTimeout(r, 200));
    if (bloqueado.current && !forcar) return;
    const dados = empacotar(tarefasRef.current, gruposRef.current, eventosRef.current, rotinasRef.current, contasRef.current, anotacoesRef.current, sessoesAnotacoesRef.current);
    const json = JSON.stringify(dados);
    if (json === jsonSalvo.current && !forcar) return;
    salvandoAgora.current = true;
    setSync("salvando");
    try {
      const nova = await salvarDados(usuario.id, dados, forcar ? null : versaoNuvem.current);
      if (nova === null) {
        // alguém salvou depois da última vez que este aparelho sincronizou
        bloqueado.current = true;
        setSync("conflito");
        return;
      }
      versaoNuvem.current = nova;
      jsonSalvo.current = json;
      bloqueado.current = false;
      setSync(jsonAtualRef.current === json ? "salvo" : "salvando");
    } catch {
      setSync("erro");
      setTimeout(() => salvarNaNuvem(), 15000); // sem conexão: tenta de novo
    } finally {
      salvandoAgora.current = false;
    }
  }

  // salva sozinho ~1,5 s depois da última alteração
  useEffect(() => {
    if (!nuvemPronta || bloqueado.current) return;
    if (jsonAtual === jsonSalvo.current) return;
    const t = setTimeout(() => salvarNaNuvem(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonAtual, nuvemPronta]);

  // ao voltar pra aba: se outro aparelho salvou algo mais novo, puxa (ou avisa do conflito)
  useEffect(() => {
    if (!nuvemPronta) return;
    async function conferir() {
      if (document.visibilityState !== "visible" || bloqueado.current || salvandoAgora.current) return;
      try {
        const nuvem = await carregarDados(usuario.id);
        if (!nuvem || nuvem.updated_at === versaoNuvem.current) return;
        const alteradoAqui = jsonAtualRef.current !== jsonSalvo.current;
        if (alteradoAqui) {
          bloqueado.current = true;
          setSync("conflito");
          return;
        }
        jsonSalvo.current = aplicarDados(nuvem.data);
        versaoNuvem.current = nuvem.updated_at;
        setSync("salvo");
      } catch {
        /* sem conexão: segue com o que tem */
      }
    }
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, [nuvemPronta, usuario.id]);

  async function usarDaNuvem() {
    try {
      const nuvem = await carregarDados(usuario.id);
      if (nuvem) {
        jsonSalvo.current = aplicarDados(nuvem.data);
        versaoNuvem.current = nuvem.updated_at;
      }
      bloqueado.current = false;
      setSync("salvo");
    } catch {
      setSync("erro");
    }
  }

  async function manterDesteAparelho() {
    bloqueado.current = false;
    await salvarNaNuvem(true);
  }

  async function sair() {
    if (jsonAtualRef.current !== jsonSalvo.current) {
      await salvarNaNuvem();
      if (
        jsonAtualRef.current !== jsonSalvo.current &&
        !window.confirm("Há alterações que ainda não foram salvas na nuvem. Sair mesmo assim e perdê-las?")
      ) {
        return;
      }
    }
    try {
      await desativarPush(); // este aparelho para de receber avisos desta conta
    } catch {
      /* ignora */
    }
    // limpa o cache local pra não deixar suas tarefas num computador compartilhado
    [STORAGE_TASKS, STORAGE_GROUPS, STORAGE_EVENTS, STORAGE_ROUTINES, STORAGE_BILLS, STORAGE_NOTES, STORAGE_NOTE_GROUPS, STORAGE_DONO, STORAGE_PRAZOS, STORAGE_LAST].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignora */
      }
    });
    await supabase.auth.signOut();
  }

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

  useEffect(() => {
    salvarStorage(STORAGE_BILLS, contas);
  }, [contas]);
  useEffect(() => { salvarStorage(STORAGE_NOTES, anotacoes); }, [anotacoes]);
  useEffect(() => { salvarStorage(STORAGE_NOTE_GROUPS, sessoesAnotacoes); }, [sessoesAnotacoes]);

  useEffect(() => {
    let url = null;
    let cancelado = false;
    try {
      localStorage.removeItem(STORAGE_BG); // versão antiga: imagem reduzida e comprimida
    } catch {
      /* ignora */
    }
    dbLer(DB_CHAVE_FUNDO)
      .then((arquivo) => {
        if (arquivo && !cancelado) {
          url = URL.createObjectURL(arquivo);
          setFundo(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    salvarStorage(STORAGE_BLUR, desfoque);
  }, [desfoque]);

  useEffect(() => {
    salvarStorage(STORAGE_BG_AJUSTE, ajusteFundo);
  }, [ajusteFundo]);

  // Contas: virou o mês e a conta foi paga → começa o ciclo novo (próxima parcela, a pagar)
  useEffect(() => {
    function virar() {
      const mes = iso(new Date()).slice(0, 7);
      const quitada = (c) => c.total > 0 && c.parcela >= c.total;
      const precisa = (c) => c.pago && c.ciclo < mes && !quitada(c);
      if (!contasRef.current.some(precisa)) return;
      const n = (x) => Number(x.slice(0, 4)) * 12 + Number(x.slice(5, 7));
      setContas((a) =>
        a.map((c) => {
          if (!precisa(c)) return c;
          const parcela = c.parcela + n(mes) - n(c.ciclo);
          return { ...c, ciclo: mes, parcela: c.total > 0 ? Math.min(c.total, parcela) : parcela, pago: false };
        })
      );
    }

    virar();
    const id = setInterval(virar, 60 * 1000);
    document.addEventListener("visibilitychange", virar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", virar);
    };
  }, []);

  // Rotinas: quando chega o dia, a tarefa volta (mesmo se você apagou a anterior)
  useEffect(() => {
    function gerar() {
      setTick((n) => n + 1); // redesenha: prazos e contas mudam com o relógio
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
        mostrarNotificacao(`Tarefa de volta · ${horaAtual()}`, {
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
            descricao: r.descricao || "",
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

      if (paginaRef.current === "anotacoes" && tecla === ATALHO_TAREFA) {
        e.preventDefault();
        abrirNovaAnotacao();
        requestAnimationFrame(() => document.getElementById("campo-titulo-anotacao")?.focus());
      } else if (paginaRef.current === "anotacoes" && tecla === ATALHO_SESSAO) {
        e.preventDefault();
        setCriandoSessaoAnotacao(true);
        requestAnimationFrame(() => document.getElementById("campo-sessao-anotacao")?.focus());
      } else if (tecla === ATALHO_TAREFA) {
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

  // avisos extras perto do prazo: 45 min antes (lembrete) e 15 min antes (chamadão)
  function verificarPrazos() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const agora = new Date();
    const vistos = lerStorage(STORAGE_PRAZOS, {});
    let mudou = false;

    tarefasRef.current.forEach((t) => {
      const fim = !t.feita && prazoDe(t);
      if (!fim) return;
      const faltam = (fim - agora) / 60000;

      [[45, false], [15, true]].forEach(([marca, grande]) => {
        const chave = `${t.id}|${t.limite} ${t.limiteHora}|${marca}`;
        // só vale nos 5 minutos seguintes à marca, para não mostrar aviso velho
        if (vistos[chave] || faltam > marca || faltam <= marca - 5) return;
        vistos[chave] = Date.now();
        mudou = true;

        const min = Math.ceil(faltam);
        const quando = t.limite === iso(agora) ? "" : ` de ${t.limite.split("-").reverse().slice(0, 2).join("/")}`;
        mostrarNotificacao(grande ? `🚨 FALTAM ${min} MIN! · ${horaAtual()}` : `⏰ Prazo chegando · ${horaAtual()}`, {
          body: `${PRIORIDADES[t.prioridade || 0].marca}${t.texto}\nPrazo às ${t.limiteHora}${quando} · faltam ${min} min`,
          tag: `prazo-${t.id}-${marca}`,
          renotify: true,
          requireInteraction: grande, // o chamadão fica na tela até você fechar
          vibrate: grande ? [300, 150, 300, 150, 600] : undefined,
        });
        if (grande) apitar();
      });
    });

    if (mudou) {
      const corte = Date.now() - 2 * 24 * 3600 * 1000;
      Object.keys(vistos).forEach((k) => vistos[k] < corte && delete vistos[k]);
      salvarStorage(STORAGE_PRAZOS, vistos);
    }
  }

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
    // atrasadas primeiro, depois por prioridade
    const peso = (t) => (rotuloPrazo(t, agora)?.atrasada ? 10 : 0) + (t.prioridade || 0);
    [...todas]
      .sort((a, b) => peso(b) - peso(a))
      .forEach((t) => {
        const sessao = nomeGrupo.get(t.grupoId);
        const pz = rotuloPrazo(t, agora);
        linhas.push(
          `• ${PRIORIDADES[t.prioridade || 0].marca}${t.texto}${t.meio ? " (meio feita)" : ""}${pz ? ` — ${pz.atrasada ? "⚠ atrasada" : pz.texto}` : ""}${sessao ? ` · ${sessao}` : ""}`
        );
      });

    if (evs.length) {
      linhas.push("Hoje na agenda:");
      evs.forEach((e) =>
        linhas.push(`  • ${e.hora ? e.hora + " " : ""}${e.titulo}${e.endereco ? ` (${e.endereco})` : ""}`)
      );
    }

    mostrarNotificacao(`Checklist · ${horaAtual()}`, {
      body: `${todas.length ? `Faltam ${todas.length}:\n` : ""}${linhas.join("\n")}`,
      tag: "checklist-pendentes", // substitui a notificação anterior
      renotify: true, // sem isso, a substituta chega em silêncio
    });
  }

  // Confere a cada 30s se entrou um novo intervalo do relógio (ex.: 21:00, 21:30... ou de 2 em 2 horas)
  useEffect(() => {
    if (!notificar || permissao !== "granted" || pushAtivo) return; // com push ativo, o servidor avisa

    const checar = () => {
      verificarPrazos();
      const slot = slotAtual(intervaloAviso);
      if (lerStorage(STORAGE_LAST, "") === slot) return; // esse intervalo já foi avisado
      salvarStorage(STORAGE_LAST, slot);
      // só avisa nos primeiros 5 min do intervalo, para não mostrar aviso velho
      if (minutosNoSlot(intervaloAviso) < 5) enviarNotificacao();
    };

    checar();
    const id = setInterval(checar, 30 * 1000);
    // ao voltar para a aba, recupera um lembrete que ficou atrasado
    document.addEventListener("visibilitychange", checar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", checar);
    };
  }, [notificar, permissao, intervaloAviso, pushAtivo]);

  function mudarIntervalo(minutos) {
    setIntervaloAviso(minutos);
    salvarStorage(STORAGE_INTERVALO, minutos);
    salvarStorage(STORAGE_LAST, slotAtual(minutos)); // recomeça a contar a partir de agora
    if (pushAtivo) atualizarPush(minutos).catch(() => setAvisoPush("Não consegui atualizar o intervalo no servidor."));
  }

  // mantém este aparelho inscrito no push (também refaz a inscrição se trocar de conta)
  useEffect(() => {
    if (!notificar || permissao !== "granted") return;
    if (!pushSuportado()) {
      // O aparelho não recebe push; atualiza o estado visual antes de retornar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPushAtivo(false);
      setAvisoPush(`${motivoSemPush()} Os lembretes só chegam com o app aberto.`);
      return;
    }
    ativarPush(usuario.id, intervaloAviso, false)
      .then(() => {
        setPushAtivo(true);
        setAvisoPush("");
      })
      .catch((err) => {
        console.error("push:", err);
        setPushAtivo(false);
        setAvisoPush(`Não consegui ativar o push (${err?.message || "erro desconhecido"}). Os lembretes só chegam com o app aberto.`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificar, permissao, usuario.id]);

  async function desativarLembretes() {
    setNotificar(false);
    setPushAtivo(false);
    setAvisoPush("");
    try {
      await desativarPush();
    } catch {
      /* ignora */
    }
  }

  async function ativarNotificacoes() {
    if (typeof Notification === "undefined") return;

    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermissao(p);

    if (p === "granted") {
      salvarStorage(STORAGE_LAST, slotAtual(intervaloAviso)); // começa a avisar no próximo intervalo
      setNotificar(true);
      if (pushSuportado()) {
        try {
          await ativarPush(usuario.id, intervaloAviso, true);
          setPushAtivo(true);
          setAvisoPush("");
        } catch (err) {
          console.error("push:", err);
          setPushAtivo(false);
          setAvisoPush(`Não consegui ativar o push (${err?.message || "erro desconhecido"}). Os lembretes só chegam com o app aberto.`);
        }
      } else {
        setAvisoPush(`${motivoSemPush()} Os lembretes só chegam com o app aberto.`);
      }
    }
  }

  /* tarefas */
  function adicionarTarefa(texto, grupoId = null, repetirDias = 0, hora = "00:00", prazo = {}) {
    let rotinaId;
    if (repetirDias > 0) {
      rotinaId = novoId();
      setRotinas((atual) => [
        ...atual,
        { id: rotinaId, texto, cada: repetirDias, hora, grupoId, prioridade: 0,
          proxima: somarDias(iso(new Date()), repetirDias), descricao: (prazo.descricao || "").trim() },
      ]);
    }
    setTarefas((atual) => [
      ...atual,
      { id: novoId(), texto, feita: false, grupoId, rotinaId, repeteDias: repetirDias, repeteHora: hora,
        limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "",
        descricao: (prazo.descricao || "").trim() },
    ]);
  }

  function adicionarEvento(ev) {
    setEventos((atual) => [...atual, { id: novoId(), ...ev }]);
  }

  function editarEvento(id, campos) {
    setEventos((atual) => atual.map((e) => (e.id === id ? { ...e, ...campos } : e)));
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

  function mover(tipo, idA, idB, destinoGrupo = undefined) {
    if (tipo === "grupo") moverItem(setGrupos, idA, idB);
    else if (tipo === "sessaoAnotacao") moverItem(setSessoesAnotacoes, idA, idB);
    else if (tipo === "anotacao") {
      if (destinoGrupo !== undefined) {
        const origem = anotacoes.find((x) => x.id === idA);
        if ((origem?.sessaoId || null) === destinoGrupo) moverItem(setAnotacoes, idA, idB);
        else setAnotacoes((xs) => xs.map((x) => x.id === idA ? { ...x, sessaoId: destinoGrupo } : x));
      }
      else moverItem(setAnotacoes, idA, idB);
    } else {
      if (destinoGrupo !== undefined) {
        const origem = tarefas.find((x) => x.id === idA);
        if ((origem?.grupoId || null) === destinoGrupo) moverItem(setTarefas, idA, idB);
        else setTarefas((xs) => xs.map((x) => x.id === idA ? { ...x, grupoId: destinoGrupo } : x));
      }
      else moverItem(setTarefas, idA, idB);
    }
  }

  function moverPor(tipo, id, delta, grupo = null) {
    let irmaos;
    if (tipo === "grupo") {
      irmaos = grupos;
    } else if (tipo === "sessaoAnotacao") {
      irmaos = sessoesAnotacoes;
    } else if (tipo === "anotacao") {
      const nota = anotacoes.find((x) => x.id === id);
      if (!nota) return;
      irmaos = anotacoes.filter((x) => (x.sessaoId || null) === (grupo || nota.sessaoId || null));
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
  function salvarEdicao(id, texto, dias, hora, prazo = {}) {
    const t = tarefas.find((x) => x.id === id);
    if (!t) return;
    const rotina = rotinas.find((r) => r.id === t.rotinaId);
    let rotinaId = null;

    if (dias > 0 && rotina) {
      rotinaId = rotina.id; // já repetia: atualiza nome, intervalo e horário
      setRotinas((a) =>
        a.map((r) =>
          r.id === rotina.id
            ? { ...r, texto, cada: dias, hora, descricao: (prazo.descricao || "").trim(), proxima: dias === r.cada ? r.proxima : somarDias(iso(new Date()), dias) }
            : r
        )
      );
    } else if (dias > 0) {
      rotinaId = novoId(); // passou a repetir
      setRotinas((a) => [
        ...a,
        { id: rotinaId, texto, cada: dias, hora, descricao: (prazo.descricao || "").trim(), grupoId: t.grupoId || null, prioridade: t.prioridade || 0, proxima: somarDias(iso(new Date()), dias) },
      ]);
    } else if (rotina) {
      setRotinas((a) => a.filter((r) => r.id !== rotina.id)); // parou de repetir
    }

    setTarefas((a) =>
      a.map((x) => (x.id === id ? { ...x, texto, repeteDias: dias, repeteHora: dias > 0 ? hora : undefined, rotinaId, limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "", descricao: (prazo.descricao || "").trim() } : x))
    );
    setEditando(null);
  }

  const edicao = { id: editando, abrir: setEditando, cancelar: () => setEditando(null), salvar: salvarEdicao };

  function adicionarConta(c) {
    const ciclo = iso(new Date()).slice(0, 7);
    setContas((a) => [...a, { id: novoId(), ...c, ciclo, parcela: 1, pago: false }]);
  }

  function salvarAnotacao(e) {
    e.preventDefault();
    const titulo = formAnotacao?.titulo?.trim();
    const texto = formAnotacao?.texto?.trim();
    if (!titulo) return;
    const item = { id: formAnotacao.id || novoId(), titulo, texto: texto || "", data: formAnotacao.data || iso(new Date()), sessaoId: formAnotacao.sessaoId || null };
    setAnotacoes((atual) => formAnotacao.id ? atual.map((a) => a.id === item.id ? item : a) : [...atual, item]);
    setFormAnotacao(null);
  }

  function abrirNovaAnotacao(sessaoId = null) {
    setFormAnotacao({ titulo: "", texto: "", data: iso(new Date()), sessaoId });
  }

  function criarSessaoAnotacao(e) {
    e.preventDefault();
    const nome = nomeSessaoAnotacao.trim();
    if (!nome) return;
    setSessoesAnotacoes((a) => [...a, { id: novoId(), nome, aberta: true }]);
    setNomeSessaoAnotacao("");
    setCriandoSessaoAnotacao(false);
  }

  function definirValorConta(id, valor) {
    setContas((a) => a.map((c) => (c.id === id ? { ...c, valor } : c)));
  }

  function alternarConta(id) {
    setContas((a) => a.map((c) => (c.id === id ? { ...c, pago: !c.pago } : c)));
  }

  function apagarConta(id) {
    setContas((a) => a.filter((c) => c.id !== id));
  }

  // imagem de fundo: guarda o arquivo original, sem redimensionar nem recomprimir
  async function escolherFundo(e) {
    const arquivo = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      const img = await createImageBitmap(arquivo); // só confere se é uma imagem válida
      img.close();
      await dbSalvar(DB_CHAVE_FUNDO, arquivo);
      const url = URL.createObjectURL(arquivo);
      if (fundo) URL.revokeObjectURL(fundo);
      setFundo(url);
      setErroFundo("");
    } catch {
      setErroFundo("Não consegui abrir ou salvar essa imagem.");
    }
  }

  // exportar / importar: um arquivo .json (texto) com tudo, pra levar de um computador pro outro
  function exportarDados() {
    const agora = new Date();
    const dados = {
      formato: FORMATO_BACKUP,
      versao: 1,
      exportadoEm: agora.toISOString(),
      tarefas,
      grupos,
      eventos,
      rotinas,
      contas,
      anotacoes,
      sessoesAnotacoes,
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarefas-${iso(agora)}-${z2(agora.getHours())}${z2(agora.getMinutes())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsgDados({ texto: `Exportado: ${tarefas.length} tarefas, ${grupos.length} sessões.`, erro: false });
  }

  async function importarDados(e) {
    const arquivo = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      const dados = JSON.parse(await arquivo.text());
      if (!dados || dados.formato !== FORMATO_BACKUP) throw new Error("formato");
      const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
      const t = lista(dados.tarefas);
      const g = lista(dados.grupos);
      const ev = lista(dados.eventos);
      const ro = lista(dados.rotinas);
      const co = lista(dados.contas);
      const an = lista(dados.anotacoes);
      const san = lista(dados.sessoesAnotacoes);
      const quando = dados.exportadoEm ? new Date(dados.exportadoEm).toLocaleString("pt-BR") : "data desconhecida";
      const ok = window.confirm(
        `Importar "${arquivo.name}" (exportado em ${quando})?\n\n` +
          `Isso SUBSTITUI tudo que está aqui agora (${tarefas.length} tarefas, ${grupos.length} sessões) ` +
          `por ${t.length} tarefas e ${g.length} sessões do arquivo.`
      );
      if (!ok) return;
      setTarefas(t);
      setGrupos(g);
      setEventos(ev);
      setRotinas(ro);
      setContas(co);
      setAnotacoes(an);
      setSessoesAnotacoes(san);
      setMsgDados({ texto: `Importado: ${t.length} tarefas, ${g.length} sessões, ${ev.length} eventos, ${ro.length} rotinas, ${co.length} contas.`, erro: false });
    } catch {
      setMsgDados({ texto: "Não consegui ler esse arquivo. Use um arquivo exportado por este app (.json).", erro: true });
    }
  }

  async function removerFundo() {
    if (fundo) URL.revokeObjectURL(fundo);
    setFundo(null);
    try {
      await dbApagar(DB_CHAVE_FUNDO);
    } catch {
      /* ignora */
    }
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

  function iniciarEdicaoSessao(tipo, sessao) {
    setSessaoEmEdicao({ tipo, id: sessao.id, nome: sessao.nome });
  }

  function salvarNomeSessao(tipo, id, nome) {
    const atualizar = tipo === "checklist" ? setGrupos : setSessoesAnotacoes;
    atualizar((itens) => itens.map((sessao) => sessao.id === id ? { ...sessao, nome } : sessao));
    setSessaoEmEdicao(null);
  }

  function cancelarEdicaoSessao(tipo, id) {
    setSessaoEmEdicao((atual) => atual?.tipo === tipo && atual.id === id ? null : atual);
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

  // enquanto a nuvem não responde, não mostra nem deixa editar (evita sobrescrever com dados velhos)
  if (!nuvemPronta) {
    return (
      <div className="ck-carregando">
        {sync === "erro-carregar" ? (
          <>
            <p>Não consegui carregar suas tarefas. Confira a conexão.</p>
            <button type="button" className="secundario" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</button>
            <button type="button" className="ck-link" onClick={() => supabase.auth.signOut()}>Sair</button>
          </>
        ) : (
          <p>Carregando…</p>
        )}
      </div>
    );
  }

  // imagem escolhida pelo usuário, ou o bg.png padrão
  const fundoAtual = fundo || FUNDO_PADRAO;

  return (
    <div className="ck-layout com-fundo">
    {ajusteFundo === "inteira" && (
      <div className="ck-fundo-preenche" style={{ backgroundImage: `url(${fundoAtual})` }} aria-hidden="true" />
    )}
    <div className="ck-fundo" style={{ backgroundImage: `url(${fundoAtual})`, filter: `blur(${desfoque}px)`, backgroundSize: ajusteFundo === "inteira" ? "contain" : "cover" }} aria-hidden="true" />
    <main className="ck">
      <header className="ck-topo">
        <div className="ck-topo-linha">
          <div className="ck-topo-titulo">
            <h1>Crysalis</h1>
        <span className="ck-contagem">
          {tarefas.length === 0
            ? "Nenhuma tarefa"
            : `${feitas} de ${tarefas.length} concluídas${
                meias > 0 ? ` · ${meias} pela metade` : ""
              }`}
        </span>
          </div>
          <div className="ck-topo-botoes">
          <span className={`ck-sync ck-sync-${sync}`} role="status" title="Sincronização com a nuvem">
            {{ salvando: "Salvando…", salvo: "Salvo", erro: "Sem conexão", conflito: "Conflito" }[sync] || ""}
          </span>

          <button type="button" className="ck-icone" onClick={() => setPagina("configuracoes")} title="Configurações" aria-label="Abrir configurações">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.8h3l.4 1.7a5 5 0 0 1 1.2.7l1.7-.5 1.5 2.6-1.3 1.2v1.4l1.3 1.2-1.5 2.6-1.7-.5a5 5 0 0 1-1.2.7l-.4 1.7h-3l-.4-1.7a5 5 0 0 1-1.2-.7l-1.7.5-1.5-2.6L3 8.9V7.5L1.7 6.3l1.5-2.6 1.7.5a5 5 0 0 1 1.2-.7z"/><circle cx="8" cy="8.2" r="2.1"/></svg>
          </button>
          </div>
        </div>
        {sync === "conflito" && (
          <div className="ck-conflito" role="alert">
            <p>Essas tarefas foram alteradas em outro lugar. Qual versão você quer manter?</p>
            <div>
              <button type="button" className="secundario" onClick={usarDaNuvem}>Usar a da nuvem</button>
              <button type="button" className="secundario" onClick={manterDesteAparelho}>Manter a deste aparelho</button>
            </div>
          </div>
        )}

      </header>

      <div className="ck-abas ck-abas-principais" role="tablist" aria-label="Área principal">
        <button type="button" role="tab" className="ck-aba" aria-selected={pagina === "tarefas"} onClick={() => setPagina("tarefas")}>Checklist</button>
        <button type="button" role="tab" className="ck-aba" aria-selected={pagina === "anotacoes"} onClick={() => setPagina("anotacoes")}>Anotações</button>
      </div>
      {pagina === "configuracoes" && <section className="ck-configuracoes">
        <div className="ck-config-titulo"><h2>Configurações</h2><button type="button" className="secundario" onClick={() => setPagina("tarefas")}>Voltar para o início</button></div>
        <div className="ck-abas" role="tablist" aria-label="Categorias de configurações">
          <button type="button" role="tab" className="ck-aba" aria-selected={abaConfiguracoes === "preferencias"} onClick={() => setAbaConfiguracoes("preferencias")}>Preferências</button>
          <button type="button" role="tab" className="ck-aba" aria-selected={abaConfiguracoes === "conta"} onClick={() => setAbaConfiguracoes("conta")}>Conta</button>
        </div>
        {abaConfiguracoes === "preferencias" ? <ConfiguracoesVisuais tema={tema} setTema={setTema} desfoque={desfoque} setDesfoque={setDesfoque} ajusteFundo={ajusteFundo} setAjusteFundo={setAjusteFundo} escolherFundo={escolherFundo} fundo={fundo} removerFundo={removerFundo} erroFundo={erroFundo} /> : <section className="ck-conta-config">
          <div className="ck-conta-identidade"><span className="ck-conta-avatar" aria-hidden="true">{(usuario.email || "?").slice(0, 1).toUpperCase()}</span><div><small>Conta conectada</small><strong>{usuario.email}</strong></div></div>
          <button type="button" className="ck-sair-conta" onClick={sair}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"><path d="M6.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h2.5"/><path d="M10 5l3 3-3 3M13 8H6.5"/></svg>Sair da conta</button>
          <div className="ck-backup-card">
            <h3>Backups</h3>
            <p>Exporte uma cópia dos seus dados ou importe um arquivo de backup.</p>
            <div className="ck-backup-acoes">
              <button type="button" className="secundario" onClick={exportarDados}>Exportar backup</button>
              <label className="ck-arquivo"><input type="file" accept=".json,application/json" onChange={importarDados} /><span>Importar backup</span></label>
            </div>
            {msgDados.texto && <p className={msgDados.erro ? "ck-erro" : "ck-msg-dados"}>{msgDados.texto}</p>}
            <small>Os dados também são sincronizados com sua conta na nuvem.</small>
          </div>
        </section>}
      </section>}
      {pagina === "tarefas" ? <>
      <div className="ck-barras-topo">
      {criandoSolta ? (
        <NovaTarefa
          idCampo="campo-tarefa"
          placeholder="Nova tarefa"
          onAdd={(texto, rep, hora, prazo) => adicionarTarefa(texto, null, rep, hora, prazo)}
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
            fecharAoClicarFora(e, () => {
              setCriandoGrupo(false);
              setNomeGrupo("");
            });
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
      </div>

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
            className={`ck-grupo${arrastando?.id === g.id ? " arrastando" : ""}${sobre === g.id && (arrastando?.tipo === "grupo" || arrastando?.tipo === "tarefa") ? " alvo" : ""}`}
            {...alvoProps(ordem, "grupo", g.id, null)}
          >
            <div className="ck-grupo-topo">
              <Alca id={g.id} tipo="grupo" grupo={null} ordem={ordem} imagem=".ck-grupo-topo" />
              {sessaoEmEdicao?.tipo === "checklist" && sessaoEmEdicao.id === g.id ? <EditarNomeSessao
                sessao={g}
                onSalvar={(nome) => salvarNomeSessao("checklist", g.id, nome)}
                onCancelar={() => cancelarEdicaoSessao("checklist", g.id)}
              /> : <button
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
              </button>}
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
              {sessaoEmEdicao?.tipo !== "checklist" || sessaoEmEdicao.id !== g.id ? <button type="button" className="ck-icone" title="Editar sessão" aria-label={`Editar sessão ${g.nome}`} onClick={() => iniciarEdicaoSessao("checklist", g)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button> : null}
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
                    onAdd={(texto, rep, hora, prazo) => adicionarTarefa(texto, g.id, rep, hora, prazo)}
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

      {grupos.length > 0 && (soltas.length > 0 || arrastando?.tipo === "tarefa") && (
        <h2 className={`ck-secao${ordem.sobre === "__sem_sessao__" && ordem.arrastando?.tipo === "tarefa" ? " alvo" : ""}`} {...alvoProps(ordem, "destinoTarefas", "__sem_sessao__", null)}>Sem sessão</h2>
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
                ? "Lembrete ativo: você recebe as tarefas que faltam"
                : "Receba as tarefas pendentes"}{" "}
              a cada{" "}
              <select
                className="ck-intervalo"
                value={intervaloAviso}
                onChange={(e) => mudarIntervalo(Number(e.target.value))}
                aria-label="Intervalo entre os lembretes"
              >
                {INTERVALOS_AVISO.map((m) => (
                  <option key={m} value={m}>{rotuloIntervalo(m)}</option>
                ))}
              </select>
              {" "}
            </p>
            <div className="ck-acoes">
              {ativo ? (
                <>
                  <button type="button" onClick={desativarLembretes}>
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
                {pushAtivo
                  ? "Os lembretes chegam neste aparelho mesmo com o app fechado."
                  : "Deixe esta aba aberta (pode ficar em segundo plano) para os lembretes continuarem chegando."}
              </small>
            )}
            {avisoPush && <small className="ck-erro">{avisoPush}</small>}
          </>
        )}
      </section>
      </> : pagina === "anotacoes" ? <section className="ck-anotacoes">
        <div className="ck-barras-topo">
          {formAnotacao && !formAnotacao.id && (!formAnotacao.sessaoId || !sessoesAnotacoes.some((s) => s.id === formAnotacao.sessaoId)) ? <FormularioAnotacao form={formAnotacao} onSalvar={salvarAnotacao} onChange={setFormAnotacao} onCancelar={() => setFormAnotacao(null)} /> : <BarraMais rotulo="Adicionar anotação" atalho={ATALHO_TAREFA} onClick={() => abrirNovaAnotacao()} />}
          {criandoSessaoAnotacao ? <form className="ck-nova-divisao" onSubmit={criarSessaoAnotacao} onBlur={(e) => fecharAoClicarFora(e, () => { setCriandoSessaoAnotacao(false); setNomeSessaoAnotacao(""); })}>
            <input id="campo-sessao-anotacao" autoFocus value={nomeSessaoAnotacao} onChange={(e) => setNomeSessaoAnotacao(e.target.value)} placeholder="Nome da sessão (ex: Ideias)" aria-label="Nome da sessão de anotações" maxLength={60} onKeyDown={(e) => { if (e.key === "Escape") { setCriandoSessaoAnotacao(false); setNomeSessaoAnotacao(""); } }} />
            <button type="submit" disabled={!nomeSessaoAnotacao.trim()}>Criar</button>
          </form> : <BarraMais rotulo="Adicionar sessão" atalho={ATALHO_SESSAO} onClick={() => setCriandoSessaoAnotacao(true)} />}
        </div>
        {formAnotacao?.id && (!formAnotacao.sessaoId || !sessoesAnotacoes.some((s) => s.id === formAnotacao.sessaoId)) && <FormularioAnotacao form={formAnotacao} onSalvar={salvarAnotacao} onChange={setFormAnotacao} onCancelar={() => setFormAnotacao(null)} />}
        {sessoesAnotacoes.map((s) => <section className={`ck-grupo${ordem.sobre === s.id && ["anotacao", "tarefa"].includes(ordem.arrastando?.tipo) ? " alvo" : ""}`} key={s.id} {...alvoProps(ordem, "sessaoAnotacao", s.id, null)}>
          <div className="ck-grupo-topo">
            <Alca id={s.id} tipo="sessaoAnotacao" grupo={null} ordem={ordem} imagem=".ck-grupo-topo" />
            {sessaoEmEdicao?.tipo === "anotacoes" && sessaoEmEdicao.id === s.id ? <EditarNomeSessao
              sessao={s}
              onSalvar={(nome) => salvarNomeSessao("anotacoes", s.id, nome)}
              onCancelar={() => cancelarEdicaoSessao("anotacoes", s.id)}
            /> : <button type="button" className="ck-grupo-titulo" aria-expanded={s.aberta !== false} onClick={() => setSessoesAnotacoes((atual) => atual.map((x) => x.id === s.id ? { ...x, aberta: x.aberta === false } : x))}><span className={`ck-seta ${s.aberta !== false ? "aberta" : ""}`}>›</span><span className="ck-grupo-nome">{s.nome}</span><span className="ck-grupo-qtd">{anotacoes.filter((a) => a.sessaoId === s.id).length}</span></button>}
            <button type="button" className="ck-mais" onClick={() => abrirNovaAnotacao(s.id)} title={`Nova anotação em ${s.nome}`} aria-label={`Nova anotação em ${s.nome}`}><IconeMais /></button>
            {sessaoEmEdicao?.tipo !== "anotacoes" || sessaoEmEdicao.id !== s.id ? <button type="button" className="ck-icone" title="Editar sessão" aria-label={`Editar sessão ${s.nome}`} onClick={() => iniciarEdicaoSessao("anotacoes", s)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button> : null}
            <button type="button" className="ck-apagar" onClick={() => { if (window.confirm(`Apagar a sessão "${s.nome}"? As anotações vão para Sem sessão.`)) { setSessoesAnotacoes((xs) => xs.filter((x) => x.id !== s.id)); setAnotacoes((xs) => xs.map((a) => a.sessaoId === s.id ? { ...a, sessaoId: null } : a)); } }}>Apagar sessão</button>
          </div>
          {formAnotacao?.sessaoId === s.id && <FormularioAnotacao form={formAnotacao} onSalvar={salvarAnotacao} onChange={setFormAnotacao} onCancelar={() => setFormAnotacao(null)} />}
          {s.aberta !== false && anotacoes.filter((a) => a.sessaoId === s.id).map((a) => <article className={`ck-anotacao${ordem.sobre === a.id && ordem.arrastando?.tipo === "anotacao" ? " alvo" : ""}`} key={a.id} {...alvoProps(ordem, "anotacao", a.id, s.id)}>
            <Alca id={a.id} tipo="anotacao" grupo={s.id} ordem={ordem} imagem=".ck-anotacao" />
            <div className="ck-anotacao-corpo"><div><strong>{a.titulo}</strong><time>{new Date(`${a.data}T00:00`).toLocaleDateString("pt-BR")}</time></div>{a.texto && !descricoesAnotacaoFechadas[a.id] && <p>{a.texto}</p>}</div>{a.texto && <ToggleDescricao fechada={descricoesAnotacaoFechadas[a.id]} onClick={() => setDescricoesAnotacaoFechadas((atual) => ({ ...atual, [a.id]: !atual[a.id] }))} />}<button type="button" className="ck-icone" title="Editar anotação" aria-label={`Editar ${a.titulo}`} onClick={() => setFormAnotacao({ ...a })}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button><button type="button" className="ck-apagar" onClick={() => setAnotacoes((xs) => xs.filter((x) => x.id !== a.id))}>Apagar</button>
          </article>)}
        </section>)}
        {(anotacoes.some((a) => !a.sessaoId || !sessoesAnotacoes.some((s) => s.id === a.sessaoId)) || arrastando?.tipo === "anotacao") && <section className="ck-grupo"><h2 className={`ck-secao${ordem.sobre === "__sem_sessao__" && ordem.arrastando?.tipo === "anotacao" ? " alvo" : ""}`} {...alvoProps(ordem, "destinoAnotacoes", "__sem_sessao__", null)}>Sem sessão</h2>{anotacoes.filter((a) => !a.sessaoId || !sessoesAnotacoes.some((s) => s.id === a.sessaoId)).map((a) => <article className={`ck-anotacao${ordem.sobre === a.id && ordem.arrastando?.tipo === "anotacao" ? " alvo" : ""}`} key={a.id} {...alvoProps(ordem, "anotacao", a.id, null)}><Alca id={a.id} tipo="anotacao" grupo={null} ordem={ordem} imagem=".ck-anotacao" /><div className="ck-anotacao-corpo"><div><strong>{a.titulo}</strong><time>{new Date(`${a.data}T00:00`).toLocaleDateString("pt-BR")}</time></div>{a.texto && !descricoesAnotacaoFechadas[a.id] && <p>{a.texto}</p>}</div>{a.texto && <ToggleDescricao fechada={descricoesAnotacaoFechadas[a.id]} onClick={() => setDescricoesAnotacaoFechadas((atual) => ({ ...atual, [a.id]: !atual[a.id] }))} />}<button type="button" className="ck-icone" title="Editar anotação" aria-label={`Editar ${a.titulo}`} onClick={() => setFormAnotacao({ ...a })}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button><button type="button" className="ck-apagar" onClick={() => setAnotacoes((xs) => xs.filter((x) => x.id !== a.id))}>Apagar</button></article>)}</section>}
        {!formAnotacao && anotacoes.length === 0 && sessoesAnotacoes.length === 0 && <p className="ck-vazio">Adicione uma anotação ou crie uma sessão.</p>}
      </section> : null}

      <footer className="ck-rodape">
        <span>
          feito por{" "}
          <span className="ck-nome-rodape" data-secreto={NOME_SECRETO} tabIndex={0}>{NOME_RODAPE}</span>
        </span>
        <span aria-hidden="true"> · </span>
        <Contato />
                <span aria-hidden="true"> · </span>
                <span aria-hidden="true"> V0.57 </span>
      </footer>
    </main>

    <aside className="ck-lateral">
      <Calendario eventos={eventos} adicionar={adicionarEvento} editar={editarEvento} apagar={apagarEvento} />
      <section className="ck-painel">
        <div className="ck-abas" role="tablist">
          <button type="button" role="tab" className="ck-aba" aria-selected={aba === "rotinas"} onClick={() => setAba("rotinas")}>
            Rotinas
          </button>
          <button type="button" role="tab" className="ck-aba" aria-selected={aba === "contas"} onClick={() => setAba("contas")}>
            Contas
            {contas.some((c) => !c.pago) && <span className="ck-aba-n">{contas.filter((c) => !c.pago).length}</span>}
          </button>
        </div>
        {aba === "rotinas" ? (
          <Rotinas rotinas={rotinas} apagar={apagarRotina} mudarPrioridade={mudarPrioridadeRotina} />
        ) : (
          <Contas contas={contas} adicionar={adicionarConta} alternar={alternarConta} apagar={apagarConta} definirValor={definirValorConta} />
        )}
      </section>
    </aside>
    </div>
  );
}

// o link do email de "esqueci a senha" volta pro site com type=recovery na URL
const VEIO_DE_RECUPERACAO =
  typeof window !== "undefined" && /type=recovery/.test(window.location.hash + window.location.search);

// Porta de entrada: sem sessão mostra o login; com sessão mostra o checklist.
export default function App() {
  const [sessao, setSessao] = useState(undefined); // undefined = ainda verificando
  const [recuperando, setRecuperando] = useState(VEIO_DE_RECUPERACAO);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((evento, nova) => {
      if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
      if (evento === "SIGNED_OUT") setRecuperando(false);
      setSessao(nova ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return <div className="ck-carregando"><p>Carregando…</p></div>;
  if (!sessao) return <Login />;
  if (recuperando) {
    return (
      <NovaSenha
        onConcluir={() => {
          setRecuperando(false);
          window.history.replaceState(null, "", window.location.pathname); // tira o token da URL
        }}
      />
    );
  }
  return <Checklist key={sessao.user.id} usuario={sessao.user} />;
}
