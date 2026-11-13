import { useEffect, useRef, useState } from "react";
import "./App.css";
import { supabase } from "./services/supabase";
import { carregarDados, criarDados, salvarDados } from "./services/dados";
import { pushSuportado, motivoSemPush, ativarPush, atualizarPush, desativarPush } from "./services/push";
import Login, { NovaSenha } from "./Login";
import Social from "./Social";
import Equipes from "./Equipes";

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
const STORAGE_JANELA_AVISOS = "checklist:janelaAvisos";
const STORAGE_EXCLUIR_SEM_CONFIRMAR = "checklist:excluirSemConfirmar";
const STORAGE_PREF_NOTIFICACOES = "checklist:preferenciasNotificacoes";
const STORAGE_AVISOS_AGENDA_FECHADOS = "checklist:avisosAgendaFechados";
const JANELA_AVISOS_PADRAO = { ativa: false, inicio: "08:00", fim: "22:00" };
const PREFERENCIAS_NOTIFICACAO_PADRAO = { checklistSummary: true, deadlines: true, collaboration: true };
const INTERVALOS_AVISO = [15, 30, 60, 120, 180];
const rotuloIntervalo = (m) => (m < 60 ? `${m} minutos` : m === 60 ? "1 hora" : `${m / 60} horas`);
const STORAGE_TEMA = "checklist:tema"; // "escuro" (padrão) | "claro"
const FORMATO_BACKUP = "checklist-backup"; // marca dos arquivos exportados
const STORAGE_DONO = "checklist:donoLocal"; // id do usuário a quem pertence o cache local

const horarioValido = (valor) => typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
function normalizarPreferenciasNotificacao(valor) {
  return {
    checklistSummary: valor?.checklistSummary !== false,
    deadlines: valor?.deadlines !== false,
    collaboration: valor?.collaboration !== false,
  };
}
function normalizarJanelaAvisos(valor) {
  return {
    ativa: valor?.ativa === true,
    inicio: horarioValido(valor?.inicio) ? valor.inicio : JANELA_AVISOS_PADRAO.inicio,
    fim: horarioValido(valor?.fim) ? valor.fim : JANELA_AVISOS_PADRAO.fim,
  };
}
function horarioPermiteAvisos(janela, agora = new Date()) {
  const configuracao = normalizarJanelaAvisos(janela);
  if (!configuracao.ativa) return true;
  const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  const inicio = minutos(configuracao.inicio);
  const fim = minutos(configuracao.fim);
  const atual = agora.getHours() * 60 + agora.getMinutes();
  if (inicio === fim) return true; // horários iguais significam o dia inteiro
  return inicio < fim ? atual >= inicio && atual < fim : atual >= inicio || atual < fim;
}

// o que vai pra nuvem (mesma forma do arquivo exportado, sem o cabeçalho)
const listaObjs = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const empacotar = (tarefas, grupos, eventos, rotinas, contas, anotacoes = [], sessoesAnotacoes = [], janelaAvisos = JANELA_AVISOS_PADRAO, excluirSemConfirmacao = true, notificationPreferences = PREFERENCIAS_NOTIFICACAO_PADRAO) => ({ tarefas, grupos, eventos, rotinas, contas, anotacoes, sessoesAnotacoes, janelaAvisos: normalizarJanelaAvisos(janelaAvisos), excluirSemConfirmacao: excluirSemConfirmacao !== false, notificationPreferences: normalizarPreferenciasNotificacao(notificationPreferences) });
const empacotarNuvem = (d) =>
  empacotar(listaObjs(d?.tarefas), listaObjs(d?.grupos), listaObjs(d?.eventos), listaObjs(d?.rotinas), listaObjs(d?.contas), listaObjs(d?.anotacoes), listaObjs(d?.sessoesAnotacoes), d?.janelaAvisos, d?.excluirSemConfirmacao, d?.notificationPreferences);
// papel de parede padrão: coloque o arquivo bg.png dentro da pasta public/
const FUNDO_PADRAO = `${import.meta.env.BASE_URL}bg.png`;
const STORAGE_BG_AJUSTE = "checklist:ajusteFundo";

const OPCOES_REPETE = [
  [0, "Não repete"],
  [1, "Todo dia"],
  [3, "A cada 3 dias"],
  [30, "Uma vez por mês"],
  ["personalizado", "Intervalo personalizado"],
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
  if (e.relatedTarget && formulario.contains(e.relatedTarget)) return;
  if (formulario.dataset.interacaoInterna === "true") return;
  window.setTimeout(() => {
    if (!formulario.contains(document.activeElement)) fechar();
  }, 50);
}
function useFecharFora(ref, ativo, fechar, seletorArea = "", seletorIgnorado = "") {
  const fecharRef = useRef(fechar);
  useEffect(() => { fecharRef.current = fechar; }, [fechar]);
  useEffect(() => {
    if (!ativo) return undefined;
    const fecharSeNecessario = (event) => {
      if (seletorIgnorado && event.target.closest?.(seletorIgnorado)) return;
      const area = seletorArea ? ref.current?.closest(seletorArea) : ref.current;
      if (area && !area.contains(event.target)) fecharRef.current?.();
    };
    document.addEventListener("pointerdown", fecharSeNecessario, true);
    return () => document.removeEventListener("pointerdown", fecharSeNecessario, true);
  }, [ativo, ref, seletorArea, seletorIgnorado]);
}
const iso = (d) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
function somarDias(dataISO, n) {
  const [a, m, d] = dataISO.split("-").map(Number);
  return iso(new Date(a, m - 1, d + n));
}
const rotuloRepete = (n) =>
  n === 1 ? "todo dia" : n === 7 ? "toda semana" : n === 30 ? "uma vez por mês" : `a cada ${n} dias`;
const rotuloRotina = (n, hora, recorrencia) => {
  let frequencia = rotuloRepete(n);
  if (recorrencia?.tipo === "semana") {
    const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    frequencia = `toda semana · ${recorrencia.diasSemana.map((dia) => dias[dia]).join(", ")}`;
  } else if (recorrencia?.tipo === "meses") {
    frequencia = recorrencia.intervalo === 1 ? "uma vez por mês" : `a cada ${recorrencia.intervalo} meses`;
  } else if (recorrencia?.tipo === "dias" && ![1, 3].includes(recorrencia.intervalo)) {
    frequencia = `a cada ${recorrencia.intervalo} dias`;
  }
  return frequencia + (hora && hora !== "00:00" ? ` às ${hora}` : "");
};

const recorrenciaSimples = (dias) => dias === 1 || dias === 3
  ? { tipo: "dias", intervalo: dias }
  : dias > 0 ? { tipo: "dias", intervalo: dias } : null;

function proximaDataRotina(dataBase, recorrencia) {
  if (!recorrencia) return somarDias(dataBase, 1);
  if (recorrencia.tipo === "meses") {
    const [ano, mes, dia] = dataBase.split("-").map(Number);
    const destino = new Date(ano, mes - 1 + Math.max(1, Number(recorrencia.intervalo) || 1), 1);
    return iso(new Date(destino.getFullYear(), destino.getMonth(), Math.min(dia, new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate())));
  }
  if (recorrencia.tipo === "semana") {
    const selecionados = new Set((recorrencia.diasSemana || []).map(Number));
    if (!selecionados.size) return somarDias(dataBase, 7);
    for (let dias = 1; dias <= 7; dias += 1) {
      const proxima = somarDias(dataBase, dias);
      const [ano, mes, dia] = proxima.split("-").map(Number);
      if (selecionados.has(new Date(ano, mes - 1, dia).getDay())) return proxima;
    }
    return somarDias(dataBase, 7);
  }
  return somarDias(dataBase, Math.max(1, Number(recorrencia.intervalo) || 1));
}

function opcaoRepeticao(recorrencia, dias) {
  const configurada = recorrencia || (dias > 0 ? { tipo: "dias", intervalo: dias } : null);
  if (!configurada) return "0";
  if (configurada.tipo === "semana") return "personalizado";
  if (configurada.tipo === "meses") return configurada.intervalo === 1 ? "30" : "personalizado";
  if (configurada.tipo === "dias" && [1, 3].includes(configurada.intervalo)) return String(configurada.intervalo);
  return "personalizado";
}

function configRecorrenciaPadrao(recorrencia, dias) {
  if (recorrencia) return { ...recorrencia, diasSemana: recorrencia.diasSemana || [] };
  return { tipo: dias === 30 ? "meses" : "dias", intervalo: dias || 2, diasSemana: [] };
}

function recorrenciaSelecionada(opcao, config) {
  if (opcao === "personalizado") return config;
  if (Number(opcao) === 30) return { tipo: "meses", intervalo: 1 };
  return recorrenciaSimples(Number(opcao));
}

function intervaloLegado(recorrencia) {
  if (!recorrencia) return 0;
  if (recorrencia.tipo === "semana") return 7;
  if (recorrencia.tipo === "meses") return Math.max(1, Number(recorrencia.intervalo) || 1) * 30;
  return Math.max(1, Number(recorrencia.intervalo) || 1);
}

// prazo da tarefa: "até hoje 17:00" e se já passou
function rotuloPrazo(t, agora = new Date()) {
  if (!t.limite) return null;
  const hoje = iso(agora);
  const dia =
    t.limite === hoje ? "hoje" : t.limite === somarDias(hoje, 1) ? "amanhã" : t.limite.split("-").reverse().slice(0, 2).join("/");
  const fim = new Date(`${t.limite}T${t.limiteHora || "23:59"}`);
  return { texto: `até ${dia}${t.limiteHora ? ` ${t.limiteHora}` : ""}`, atrasada: !t.feita && fim < agora };
}

function prioridadePeloPrazo(t, agora = new Date()) {
  const prioridade = Number(t.prioridade) || 0;
  if (!prioridade || !t.limite || t.feita) return prioridade;
  const prazo = new Date(`${t.limite}T${t.limiteHora || "23:59"}:00`).getTime();
  const idCriacao = Number(t.criadaEm || t.id);
  const criada = Number.isFinite(idCriacao) && idCriacao > 1e12 ? idCriacao : agora.getTime();
  const duracao = prazo - criada;
  const restante = prazo - agora.getTime();
  if (duracao <= 0) return prioridade;
  if (restante <= duracao / 4) return Math.max(prioridade, 3);
  if (restante <= duracao / 2) return Math.max(prioridade, 2);
  return prioridade;
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

function DiaMes({ value, onChange, rotulo = "Data limite" }) {
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
    <span className="ck-hora24" role="group" aria-label={`${rotulo}: dia e mês (opcional)`} title={`${rotulo}: dia/mês (opcional). O ano é o próximo em que a data ainda não passou.`}>
      <input
        ref={refD}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={d}
        placeholder="dd"
        aria-label={`${rotulo} - dia`}
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
        aria-label={`${rotulo} - mês`}
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
    <span className="ck-prazo-campos">
      <span className="ck-prazo-rotulo">Prazo</span>
      <DiaMes value={limite} onChange={onLimite} />
      <Hora24 value={hora} onChange={onHora} opcional rotulo="Horário do prazo (opcional)" />
    </span>
  );
}

function IconeComentario({ tamanho = 16 }) {
  return <svg viewBox="0 0 16 16" width={tamanho} height={tamanho} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 7.7a5.6 5.6 0 0 1-5.8 5.1 6.2 6.2 0 0 1-2.5-.5L2 13l.8-2.7a5 5 0 0 1-.8-2.6A5.5 5.5 0 0 1 7.8 2.5h.4a5.5 5.5 0 0 1 5.3 5.2z" /><path d="M5.5 7.8h5M5.5 10h3.2" /></svg>;
}

function CampoComentarioTarefa({ valor, onChange, children }) {
  const [aberto, setAberto] = useState(Boolean(valor));
  return <div className="ck-tarefa-form-rodape">
    <div className="ck-tarefa-form-botoes">{children}</div>
    {aberto && <textarea className="ck-comentario-input" rows={2} maxLength={1000} placeholder="Comentário (opcional)" aria-label="Comentário da tarefa" value={valor} onChange={(e) => onChange(e.target.value)} onKeyDown={enviarAoEnter} />}
    <button type="button" className="ck-comentario-botao" aria-label={aberto ? "Ocultar campo de comentário" : "Adicionar comentário"} aria-expanded={aberto} title={aberto ? "Ocultar comentário" : "Adicionar comentário"} onClick={() => setAberto((atual) => !atual)}><IconeComentario /></button>
  </div>;
}

function SeletorRepeticao({ value, onChange, config, onConfigChange }) {
  const dias = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
  return <>
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Frequência da rotina">
      {OPCOES_REPETE.map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
    </select>
    {value === "personalizado" && <div className="ck-repeticao-personalizada">
      <label className="ck-repeticao-tipo">Repetir por
        <select value={config.tipo} onChange={(e) => onConfigChange((atual) => ({ ...atual, tipo: e.target.value }))}>
          <option value="dias">A cada N dias</option>
          <option value="semana">Dias da semana</option>
          <option value="meses">A cada N meses</option>
        </select>
      </label>
      {config.tipo === "dias" || config.tipo === "meses" ? <label className="ck-repeticao-intervalo">A cada
        <input type="number" min="1" max={config.tipo === "meses" ? "24" : "365"} value={config.intervalo || 1} onChange={(e) => onConfigChange((atual) => ({ ...atual, intervalo: Math.max(1, Number(e.target.value) || 1) }))} />
        {config.tipo === "meses" ? "meses" : "dias"}
      </label> : <div className="ck-dias-semana" aria-label="Dias da semana">
        {dias.map(([numero, rotulo]) => <label key={numero} className={(config.diasSemana || []).includes(numero) ? "selecionado" : ""}><input type="checkbox" checked={(config.diasSemana || []).includes(numero)} onChange={(e) => onConfigChange((atual) => ({ ...atual, diasSemana: e.target.checked ? [...new Set([...(atual.diasSemana || []), numero])].sort((a, b) => dias.findIndex(([dia]) => dia === a) - dias.findIndex(([dia]) => dia === b)) : (atual.diasSemana || []).filter((dia) => dia !== numero) }))} />{rotulo}</label>)}
      </div>}
    </div>}
  </>;
}

/* Calendário do mês com eventos */
function Calendario({ eventos, tarefasAgendadas, adicionar, editar, apagar, agendarTarefa, editarTarefa, apagarTarefa, alternarTarefaAgendada }) {
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
  const [abrindoTarefa, setAbrindoTarefa] = useState(false);
  const [editandoTarefaId, setEditandoTarefaId] = useState(null);
  const eventoFormRef = useRef(null);

  const ano = mes.getFullYear();
  const m = mes.getMonth();
  const vazios = new Date(ano, m, 1).getDay();
  const total = new Date(ano, m + 1, 0).getDate();
  const comEvento = new Set(eventos.map((e) => e.data));
  const comTarefa = new Set(tarefasAgendadas.map((t) => t.agendadaPara));
  const doDia = eventos
    .filter((e) => e.data === sel)
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  const tarefasDoDia = tarefasAgendadas.filter((t) => t.agendadaPara === sel);

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
  useFecharFora(eventoFormRef, abrindo, cancelar);

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

  function abrirFormTarefa() {
    setAbrindoTarefa(true);
  }

  return (
    <section className="ck-cal">
      <div className="ck-cal-topo">
        <button type="button" className="ck-cal-nav" aria-label="Mês anterior" onClick={() => setMes(new Date(ano, m - 1, 1))}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9.5 3.5-4.5 4.5 4.5 4.5" /></svg>
        </button>
        <strong>{MESES[m]} de {ano}</strong>
        <button type="button" className="ck-cal-nav" aria-label="Próximo mês" onClick={() => setMes(new Date(ano, m + 1, 1))}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6.5 3.5 4.5 4.5-4.5 4.5" /></svg>
        </button>
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
              {(comEvento.has(id) || comTarefa.has(id)) && <i className={`ck-marcador-dia ${comEvento.has(id) && comTarefa.has(id) ? "ambos" : comEvento.has(id) ? "evento" : "tarefa"}`} />}
            </button>
          );
        })}
      </div>

      <h3 className="ck-cal-data">
        {new Date(`${sel}T00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
      </h3>

      {doDia.length === 0 && tarefasDoDia.length === 0 ? (
        <p className="ck-vazio-cal">Nenhum evento neste dia.</p>
      ) : (
        <ul className="ck-eventos">
          {doDia.map((e) => (
            <li key={e.id}>
              <span className="ck-ev-hora">{e.hora ? (e.horaFim ? `${e.hora}–${e.horaFim}` : e.hora) : "Dia todo"}</span>
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
              <BotaoApagar nome={`evento ${e.titulo}`} onClick={() => apagar(e.id)} />
            </li>
          ))}
          {tarefasDoDia.map((t) => editandoTarefaId === t.id ? (
            <li key={`tarefa-${t.id}`} className="ck-evento-tarefa ck-evento-tarefa-editando">
              <EditarTarefa
                tarefa={t}
                incluirDataAgenda
                onSalvar={(textoAtual, dias, horaAtual, prazo) => { editarTarefa(t.id, textoAtual, dias, horaAtual, prazo); setEditandoTarefaId(null); }}
                onCancelar={() => setEditandoTarefaId(null)}
              />
            </li>
          ) : (
            <li key={`tarefa-${t.id}`} className={`ck-evento-tarefa${t.feita ? " feita" : ""}`}>
              <span className="ck-ev-hora">Tarefa</span>
              <button type="button" className="ck-ev-titulo ck-ev-tarefa-titulo" onClick={() => alternarTarefaAgendada(t.id)} title="Marcar tarefa como concluída">
                <span className={`ck-ev-tarefa-caixa${t.feita ? " feita" : t.meio ? " meio" : ""}`} aria-hidden="true">{t.feita ? "✓" : t.meio ? "·" : ""}</span>{t.texto}
              </button>
              <button type="button" className="ck-icone" onClick={() => setEditandoTarefaId(t.id)} title="Editar tarefa" aria-label={`Editar ${t.texto}`}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg>
              </button>
              <BotaoApagar nome={`tarefa ${t.texto}`} onClick={() => apagarTarefa(t.id)} />
            </li>
          ))}
        </ul>
      )}

      {abrindo ? (
        <form
          ref={eventoFormRef}
          className="ck-form-grupo"
          onSubmit={enviar}
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
      {abrindoTarefa ? (
        <NovaTarefa
          modoAgenda
          dataInicial={sel}
          placeholder="Nova tarefa agendada"
          onAdd={(texto, repetir, horaRotina, prazo) => {
            agendarTarefa(texto, prazo.agendadaPara, repetir, horaRotina, prazo);
            setSel(prazo.agendadaPara);
            setMes(new Date(`${prazo.agendadaPara}T00:00`));
            setAbrindoTarefa(false);
          }}
          onFechar={() => setAbrindoTarefa(false)}
        />
      ) : (
        <BarraMais rotulo="Agendar tarefa" onClick={abrirFormTarefa} />
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

function BotaoApagar({ nome, onClick }) {
  return <button type="button" className="ck-apagar ck-apagar-icone" onClick={onClick} title={`Apagar ${nome}`} aria-label={`Apagar ${nome}`}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m4 4 8 8m0-8-8 8" /></svg>
  </button>;
}

function ConfirmacaoChecklist({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null;
  return <div className="ck-social-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="ck-social-modal" role="alertdialog" aria-modal="true" aria-labelledby="ck-checklist-confirm-title" aria-describedby="ck-checklist-confirm-message">
      <h2 id="ck-checklist-confirm-title">{dialog.title}</h2>
      <p id="ck-checklist-confirm-message">{dialog.message}</p>
      <div><button type="button" autoFocus className="ck-social-danger" onClick={onConfirm}>{dialog.action || "Excluir"}</button><button type="button" className="secundario" onClick={onCancel}>Cancelar</button></div>
    </section>
  </div>;
}

function FormularioConta({ conta, onSalvar, onCancelar }) {
  const formRef = useRef(null);
  const [nome, setNome] = useState(conta.nome);
  const [valor, setValor] = useState(conta.valor ? String(conta.valor).replace(".", ",") : "");
  const [dia, setDia] = useState(String(conta.dia));
  const [parcelas, setParcelas] = useState(conta.total ? String(conta.total) : "");
  useFecharFora(formRef, true, onCancelar, "li.ck-item-editando");

  function enviar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    onSalvar({
      nome: nome.trim(),
      valor: lerValor(valor),
      dia: Math.min(31, Math.max(1, Number(dia) || conta.dia)),
      total: Math.max(0, Math.floor(Number(parcelas) || 0)),
    });
  }

  return <form ref={formRef} className="ck-form-grupo ck-form-conta" onSubmit={enviar} onKeyDown={(e) => e.key === "Escape" && onCancelar()}>
    <input autoFocus type="text" className="ck-campo-largo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da conta" aria-label="Nome da conta" maxLength={80} required />
    <input type="text" inputMode="decimal" className="ck-num ck-num-v" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" aria-label="Valor da conta" />
    <input type="number" className="ck-num" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="Vence dia" aria-label="Dia do vencimento" />
    <input type="number" className="ck-num ck-num-p" min="0" max="999" value={parcelas} onChange={(e) => setParcelas(e.target.value)} placeholder="Parcelas" aria-label="Número de parcelas (0 = sem parcelas)" />
    <span className="ck-edit-acoes"><button type="submit" disabled={!nome.trim()}>Salvar</button><button type="button" className="ck-icone" onClick={onCancelar} title="Cancelar edição" aria-label="Cancelar edição"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m4 4 8 8m0-8-8 8" /></svg></button></span>
  </form>;
}

/* Contas recorrentes: vence todo mês no mesmo dia, com parcelas opcionais */
function vencimento(c) {
  const [a, m] = c.ciclo.split("-").map(Number);
  return new Date(a, m - 1, Math.min(c.dia, new Date(a, m, 0).getDate()));
}

function Contas({ contas, adicionar, alternar, apagar, definirValor, editar }) {
  const [abrindo, setAbrindo] = useState(false);
  const addFormRef = useRef(null);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState("");
  const [dia, setDia] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [valor, setValor] = useState("");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const total = contas.reduce((soma, c) => soma + (c.valor || 0), 0);
  const pago = contas.filter((c) => c.pago).reduce((soma, c) => soma + (c.valor || 0), 0);

  function fecharFormulario() {
    setAbrindo(false); setNome(""); setDia(""); setParcelas(""); setValor("");
  }
  useFecharFora(addFormRef, abrindo, fecharFormulario, "", ".ck-conta-adicionar");

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
        <div className="ck-resumo-cabecalho">
          <div><span className="ck-resumo-rotulo">Despesas fixas</span><strong className="ck-resumo-valor">{BRL(total)}</strong></div>
          <button type="button" className="ck-mais ck-conta-adicionar" onClick={() => setAbrindo((atual) => !atual)} aria-label={abrindo ? "Fechar formulário de conta" : "Adicionar conta"} title={abrindo ? "Fechar" : "Adicionar conta"} aria-expanded={abrindo}><IconeMais /></button>
        </div>
        {total > 0 && (
          <span className="ck-resumo-sub">
            Pago {BRL(pago)} · Falta {BRL(total - pago)}
          </span>
        )}
      </div>
      {contas.length === 0 ? (
        <p className="ck-vazio-cal">Nenhuma conta ainda. Use o + ao lado do total para adicionar.</p>
      ) : (
        <ul className="ck-lista">
          {contas.map((c) => {
            const [texto, classe] = situacao(c);
            if (editandoId === c.id) return <li key={c.id} className="ck-item-editando"><FormularioConta conta={c} onSalvar={(campos) => { editar(c.id, campos); setEditandoId(null); }} onCancelar={() => setEditandoId(null)} /></li>;
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
                <button type="button" className="ck-icone" onClick={() => setEditandoId(c.id)} title={`Editar conta ${c.nome}`} aria-label={`Editar conta ${c.nome}`}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button>
                <BotaoApagar nome={`conta ${c.nome}`} onClick={() => apagar(c.id)} />
              </li>
            );
          })}
        </ul>
      )}

      {abrindo ? (
        <form
          ref={addFormRef}
          className="ck-form-grupo"
          onSubmit={enviar}
          onKeyDown={(e) => e.key === "Escape" && fecharFormulario()}
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
          <input type="number" className="ck-num ck-num-p" min="0" max="999" value={parcelas} onChange={(e) => setParcelas(e.target.value)} placeholder="Parcelas" aria-label="Número de parcelas (opcional; 0 = sem parcelas)" title="Número de parcelas (opcional; 0 = sem parcelas)" />
          <button type="submit" disabled={!nome.trim()}>Adicionar</button>
        </form>
      ) : null}
    </section>
  );
}

/* Lista das tarefas que se repetem */
function EditarRotina({ rotina, grupos, onSalvar, onCancelar }) {
  const formularioRef = useRef(null);
  const cancelarRef = useRef(onCancelar);
  const [texto, setTexto] = useState(rotina.texto);
  const [repeticao, setRepeticao] = useState(opcaoRepeticao(rotina.recorrencia, rotina.cada));
  const [configRepeticao, setConfigRepeticao] = useState(configRecorrenciaPadrao(rotina.recorrencia, rotina.cada));
  const [hora, setHora] = useState(rotina.hora || "00:00");
  const [limite, setLimite] = useState(rotina.limite || (rotina.limiteHora ? iso(new Date()) : ""));
  const [limiteHora, setLimiteHora] = useState(rotina.limiteHora || "");
  const [proxima, setProxima] = useState(rotina.proxima || iso(new Date()));
  const [descricao, setDescricao] = useState(rotina.descricao || "");
  const [comentario, setComentario] = useState(rotina.comentario || "");
  const [grupoId, setGrupoId] = useState(rotina.grupoId || "");

  useEffect(() => { cancelarRef.current = onCancelar; }, [onCancelar]);
  useEffect(() => {
    function fecharSeClicouFora(e) {
      const formulario = formularioRef.current;
      const cartao = formulario?.closest("li.ck-item-editando") || formulario;
      if (cartao && !cartao.contains(e.target)) cancelarRef.current();
    }
    document.addEventListener("pointerdown", fecharSeClicouFora, true);
    return () => document.removeEventListener("pointerdown", fecharSeClicouFora, true);
  }, []);

  function enviar(e) {
    e.preventDefault();
    if (!texto.trim() || !proxima) return;
    const recorrencia = recorrenciaSelecionada(repeticao, configRepeticao);
    if (recorrencia?.tipo === "semana" && !recorrencia.diasSemana?.length) return;
    onSalvar({ texto: texto.trim(), cada: intervaloLegado(recorrencia), recorrencia, hora: hora || "00:00", limite: limite || (limiteHora ? iso(new Date()) : ""), limiteHora, proxima, descricao: descricao.trim(), comentario: comentario.trim(), grupoId: grupoId || null });
  }

  return <form ref={formularioRef} className="ck-form-grupo ck-form-rotina" onSubmit={enviar} onBlur={(e) => { const cartao = e.currentTarget.closest("li.ck-item-editando") || e.currentTarget; if (e.relatedTarget && !cartao.contains(e.relatedTarget)) onCancelar(); }} onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); else if (e.target.matches("textarea") && !e.target.classList.contains("ck-comentario-input")) enviarAoEnter(e); }}>
    <input autoFocus type="text" className="ck-campo-largo" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Nome da rotina" maxLength={200} required />
    <div className="ck-rotina-frequencia">
      <SeletorRepeticao value={repeticao} onChange={setRepeticao} config={configRepeticao} onConfigChange={setConfigRepeticao} />
      <Hora24 value={hora} onChange={setHora} rotulo="Horário da rotina" />
    </div>
    <CampoPrazo limite={limite} hora={limiteHora} onLimite={setLimite} onHora={setLimiteHora} />
    <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} aria-label="Sessão das próximas tarefas">
      <option value="">Sem sessão</option>
      {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
    </select>
    <label className="ck-form-data"><span>Próxima</span><DiaMes value={proxima} onChange={setProxima} rotulo="Próxima ocorrência" /></label>
      <textarea className="ck-campo-largo" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" aria-label="Observações da rotina" maxLength={1000} />
    <CampoComentarioTarefa valor={comentario} onChange={setComentario}>
      <span className="ck-edit-acoes"><button type="submit" disabled={!texto.trim() || !proxima || (repeticao === "personalizado" && configRepeticao.tipo === "semana" && !configRepeticao.diasSemana.length)}>Salvar</button><button type="button" className="ck-icone" onClick={onCancelar} title="Cancelar edição" aria-label="Cancelar edição"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m4 4 8 8m0-8-8 8" /></svg></button></span>
    </CampoComentarioTarefa>
  </form>;
}

function Rotinas({ rotinas, grupos, apagar, mudarPrioridade, editar }) {
  const [editandoId, setEditandoId] = useState(null);
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
        {rotinas.map((r) => editandoId === r.id ? (
          <li key={r.id} className="ck-item-editando"><EditarRotina rotina={r} grupos={grupos} onSalvar={(campos) => { editar(r.id, campos); setEditandoId(null); }} onCancelar={() => setEditandoId(null)} /></li>
        ) : (
          <li key={r.id}>
            <span className="ck-rot-texto">
              {r.texto}
              <span className="ck-rot-info">↻ {rotuloRotina(r.cada, r.hora, r.recorrencia)}</span>
              <span className="ck-rot-info ck-vencimento">Próxima em {r.proxima.split("-").reverse().slice(0, 2).join("/")} às {r.hora || "00:00"}</span>
            </span>
            <button
              type="button"
              className={`ck-prio p${r.prioridade || 0}`}
              onClick={() => mudarPrioridade(r.id)}
              title={`Prioridade ao voltar: ${PRIORIDADES[r.prioridade || 0].nome} (clique para trocar)`}
              aria-label={`Prioridade ao voltar: ${PRIORIDADES[r.prioridade || 0].nome}. Clique para trocar.`}
            />
            <button type="button" className="ck-icone" onClick={() => setEditandoId(r.id)} title={`Editar rotina ${r.texto}`} aria-label={`Editar rotina ${r.texto}`}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button>
            <BotaoApagar nome={`rotina ${r.texto}`} onClick={() => apagar(r.id)} />
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

/* Sinal de adição nos controles de criar */
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
function NovaTarefa({ onAdd, placeholder, onFechar, idCampo, modoAgenda = false, dataInicial }) {
  const formRef = useRef(null);
  const [texto, setTexto] = useState("");
  const [repete, setRepete] = useState("0");
  const [configRepeticao, setConfigRepeticao] = useState({ tipo: "dias", intervalo: 2, diasSemana: [] });
  const [hora, setHora] = useState("00:00");
  const [limite, setLimite] = useState("");
  const [limiteHora, setLimiteHora] = useState("");
  const [descricao, setDescricao] = useState("");
  const [comentario, setComentario] = useState("");
  const [agendadaPara, setAgendadaPara] = useState(dataInicial || iso(new Date()));

  useEffect(() => {
    if (!onFechar) return undefined;
    function fecharAoTocarFora(e) {
      if (formRef.current && !formRef.current.contains(e.target)) onFechar();
    }
    document.addEventListener("pointerdown", fecharAoTocarFora, true);
    return () => document.removeEventListener("pointerdown", fecharAoTocarFora, true);
  }, [onFechar]);

  function enviar(e) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return;
    const recorrencia = recorrenciaSelecionada(repete, configRepeticao);
    if (recorrencia?.tipo === "semana" && !recorrencia.diasSemana?.length) return;
    const prazoResolvido = limite || (limiteHora ? iso(new Date()) : "");
    onAdd(limpo, intervaloLegado(recorrencia), hora || "00:00", {
      limite: prazoResolvido, limiteHora, descricao, comentario, recorrencia,
      ...(modoAgenda ? { agendadaPara } : {}),
    });
    onFechar?.();
    setTexto("");
    setLimite("");
    setLimiteHora("");
    setDescricao("");
    setComentario("");
  }

  return (
    <form
      ref={formRef}
      className={`ck-form-grupo ck-editor-tarefa${modoAgenda ? " ck-form-tarefa-agendada" : ""}`}
      onSubmit={enviar}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && onFechar) onFechar();
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
      {modoAgenda && <label className="ck-form-data ck-form-data-agendada"><span>Começar em</span><input type="date" value={agendadaPara} onChange={(e) => setAgendadaPara(e.target.value)} required /></label>}
      <SeletorRepeticao value={repete} onChange={setRepete} config={configRepeticao} onConfigChange={setConfigRepeticao} />
      {repete !== "0" && (
        <Hora24 value={hora} onChange={setHora} rotulo="Horário em que a tarefa volta" />
      )}
      <CampoPrazo limite={limite} hora={limiteHora} onLimite={setLimite} onHora={setLimiteHora} />
      <textarea
        className="ck-campo-largo"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onFechar && onFechar(); else enviarAoEnter(e); }}
        placeholder="Descrição (opcional)"
        aria-label="Observações da tarefa"
        rows={2}
        maxLength={1000}
      />
      <CampoComentarioTarefa valor={comentario} onChange={setComentario}>
        <button type="submit" disabled={!texto.trim() || (repete === "personalizado" && configRepeticao.tipo === "semana" && !configRepeticao.diasSemana.length)}>
          {modoAgenda ? "Agendar tarefa" : "Adicionar"}
        </button>
      </CampoComentarioTarefa>
    </form>
  );
}

/* Alça com bolinhas: arraste ou use as setas ↑ ↓ com ela em foco */
function Alca({ id, tipo, grupo, ordem, imagem, taskData }) {
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
        if (tipo === "tarefa" && taskData && !taskData.feita) e.dataTransfer.setData("application/x-crysalis-task", JSON.stringify(taskData));
        e.dataTransfer.effectAllowed = tipo === "tarefa" && taskData && !taskData.feita ? "copyMove" : "move";
        e.dataTransfer.setData("text/plain", String(id));
        const el = e.currentTarget.closest(imagem);
        if (el) e.dataTransfer.setDragImage(el, 0, 0);
        setTimeout(() => ordem.setArrastando({ tipo, id, grupo }), 0);
      }}
      onDragEnd={ordem.fim}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch" || tipo !== "tarefa" || !taskData || taskData.feita) return;
        e.preventDefault();
        const x = e.clientX; const y = e.clientY;
        const timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent("crysalis:share-task-drag-start", { detail: { task: taskData, x, y } })), 320);
        const limpar = () => { window.clearTimeout(timer); window.removeEventListener("pointerup", limpar); window.removeEventListener("pointercancel", limpar); };
        window.addEventListener("pointerup", limpar, { once: true });
        window.addEventListener("pointercancel", limpar, { once: true });
      }}
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
function EditarTarefa({ tarefa, onSalvar, onCancelar, incluirDataAgenda = false }) {
  const formularioRef = useRef(null);
  const cancelarRef = useRef(onCancelar);
  const [texto, setTexto] = useState(tarefa.texto);
  const [repete, setRepete] = useState(opcaoRepeticao(tarefa.recorrencia, tarefa.repeteDias || 0));
  const [configRepeticao, setConfigRepeticao] = useState(configRecorrenciaPadrao(tarefa.recorrencia, tarefa.repeteDias || 0));
  const [hora, setHora] = useState(tarefa.repeteHora || "00:00");
  const [limite, setLimite] = useState(tarefa.limite || (tarefa.limiteHora ? iso(new Date()) : ""));
  const [limiteHora, setLimiteHora] = useState(tarefa.limiteHora || "");
  const [descricao, setDescricao] = useState(tarefa.descricao || "");
  const [comentario, setComentario] = useState(tarefa.comentario || "");
  const [agendadaPara, setAgendadaPara] = useState(tarefa.agendadaPara || iso(new Date()));

  useEffect(() => { cancelarRef.current = onCancelar; }, [onCancelar]);
  useEffect(() => {
    function fecharSeClicouFora(e) {
      const formulario = formularioRef.current;
      const quadro = formulario?.closest("li.editando, li.ck-evento-tarefa-editando") || formulario;
      if (quadro && !quadro.contains(e.target)) cancelarRef.current();
    }
    document.addEventListener("pointerdown", fecharSeClicouFora, true);
    return () => document.removeEventListener("pointerdown", fecharSeClicouFora, true);
  }, []);

  return (
    <form
      ref={formularioRef}
      className="ck-form-grupo ck-editor-tarefa"
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) {
          const recorrencia = recorrenciaSelecionada(repete, configRepeticao);
          if (recorrencia?.tipo === "semana" && !recorrencia.diasSemana?.length) return;
          onSalvar(texto.trim(), intervaloLegado(recorrencia), hora || "00:00", {
          limite: limite || (limiteHora ? iso(new Date()) : ""), limiteHora, descricao, comentario, recorrencia,
          ...(incluirDataAgenda ? { agendadaPara } : {}),
        });
        }
      }}
      onBlur={(e) => { const quadro = e.currentTarget.closest("li.editando, li.ck-evento-tarefa-editando") || e.currentTarget; if (e.relatedTarget && !quadro.contains(e.relatedTarget)) onCancelar(); }}
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
      {incluirDataAgenda && <label className="ck-form-data ck-form-data-agendada"><span>Começar em</span><input type="date" value={agendadaPara} onChange={(e) => setAgendadaPara(e.target.value)} required /></label>}
      <SeletorRepeticao value={repete} onChange={setRepete} config={configRepeticao} onConfigChange={setConfigRepeticao} />
      {repete !== "0" && (
        <Hora24 value={hora} onChange={setHora} rotulo="Horário em que a tarefa volta" />
      )}
      <CampoPrazo limite={limite} hora={limiteHora} onLimite={setLimite} onHora={setLimiteHora} />
      <textarea
        className="ck-campo-largo"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); else enviarAoEnter(e); }}
        placeholder="Descrição (opcional)"
        aria-label="Observações da tarefa"
        rows={2}
        maxLength={1000}
      />
      <CampoComentarioTarefa valor={comentario} onChange={setComentario}>
        <span className="ck-edit-acoes">
          <button type="submit" disabled={!texto.trim() || (repete === "personalizado" && configRepeticao.tipo === "semana" && !configRepeticao.diasSemana.length)}>Salvar</button>
          <button type="button" className="ck-icone" onClick={onCancelar} title="Cancelar (Esc)" aria-label="Cancelar edição">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </span>
      </CampoComentarioTarefa>
    </form>
  );
}

/* Lista de tarefas (usada fora e dentro das sessões) */
function ToggleDescricao({ fechada, onClick }) {
  return <button type="button" className="ck-descricao-toggle" aria-label={fechada ? "Mostrar descrição" : "Ocultar descrição"} title={fechada ? "Mostrar descrição" : "Ocultar descrição"} aria-expanded={!fechada} onClick={onClick}><svg className={`ck-descricao-seta${fechada ? "" : " aberta"}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 6 4.5 4.5L12.5 6" /></svg></button>;
}

const ICONES_SESSAO = [
  ["butterfly", "Borboleta"], ["home", "Casa"], ["person", "Pessoa"], ["work", "Trabalho"],
  ["book", "Estudos"], ["heart", "Favoritos"], ["star", "Importante"], ["calendar", "Agenda"],
  ["target", "Objetivo"], ["folder", "Geral"],
];

function IconeSessao({ icone = "butterfly", className = "", monocromatico = false }) {
  if (icone === "butterfly") {
    const classe = `ck-sessao-icone logo${className ? ` ${className}` : ""}${monocromatico ? " monocromatico" : ""}`;
    const origem = `${import.meta.env.BASE_URL}Logo.svg`;
    return monocromatico
      ? <span className={classe} style={{ maskImage: `url("${origem}")`, WebkitMaskImage: `url("${origem}")` }} aria-hidden="true" />
      : <img className={classe} src={origem} alt="" aria-hidden="true" />;
  }
  const paths = {
    home: <><path d="m2.5 8 6.5-5.5L15.5 8v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14z" /><path d="M7 15.5v-5h4v5" /></>,
    person: <><circle cx="9" cy="5.5" r="3" /><path d="M3 16c.3-3 2.3-4.7 6-4.7s5.7 1.7 6 4.7" /></>,
    work: <><rect x="2.5" y="5.5" width="13" height="9.5" rx="1.5" /><path d="M6 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 12 4v1.5M2.5 9h13M7 8.8v1.5h4V8.8" /></>,
    book: <><path d="M2.5 3.5h4A2.5 2.5 0 0 1 9 6v9a2.5 2.5 0 0 0-2.5-2.5h-4z" /><path d="M15.5 3.5h-4A2.5 2.5 0 0 0 9 6v9a2.5 2.5 0 0 1 2.5-2.5h4z" /></>,
    heart: <path d="M9 15.5 3 9.8a3.7 3.7 0 0 1 5.2-5.2L9 5.4l.8-.8A3.7 3.7 0 0 1 15 9.8z" />,
    star: <path d="m9 2.3 2 4.1 4.5.7-3.2 3.2.8 4.5L9 12.7l-4.1 2.1.8-4.5L2.5 7.1 7 6.4z" />,
    calendar: <><rect x="2.5" y="4" width="13" height="11.5" rx="1.5" /><path d="M5.5 2.5v3M12.5 2.5v3M2.5 7.5h13M5.5 10h2m2 0h2m-6 2.5h2" /></>,
    target: <><circle cx="9" cy="9" r="6.5" /><circle cx="9" cy="9" r="3.5" /><circle cx="9" cy="9" r=".7" fill="currentColor" stroke="none" /></>,
    folder: <path d="M2.5 5A1.5 1.5 0 0 1 4 3.5h3l1.5 2h5.5A1.5 1.5 0 0 1 15.5 7v6A1.5 1.5 0 0 1 14 14.5H4A1.5 1.5 0 0 1 2.5 13z" />,
  };
  return <svg className={`ck-sessao-icone${className ? ` ${className}` : ""}`} viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[icone] || paths.folder}</svg>;
}

function SeletorIconeSessao({ value, onChange }) {
  return <div className="ck-seletor-icones" role="group" aria-label="Ícone da sessão">
    {ICONES_SESSAO.map(([icone, rotulo]) => <button key={icone} type="button" className="ck-opcao-icone" aria-label={rotulo} title={rotulo} aria-pressed={value === icone} onClick={() => onChange(icone)}><IconeSessao icone={icone} monocromatico /></button>)}
  </div>;
}

function EditarNomeSessao({ sessao, onSalvar, onCancelar }) {
  const formRef = useRef(null);
  const [nome, setNome] = useState(sessao.nome);
  const [icone, setIcone] = useState(sessao.icone || "butterfly");
  useFecharFora(formRef, true, onCancelar);
  return <form ref={formRef} className="ck-editar-sessao" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) onSalvar(nome.trim(), icone); }} onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); }}>
    <SeletorIconeSessao value={icone} onChange={setIcone} />
    <input autoFocus type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required aria-label="Nome da sessão" />
    <button type="submit" className="ck-icone" title="Salvar nome da sessão" aria-label="Salvar nome da sessão" disabled={!nome.trim()}><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3.2 3.2L13 4.5" /></svg></button>
    <button type="button" className="ck-icone" title="Cancelar" aria-label="Cancelar edição do nome" onClick={onCancelar}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9m0-9-9 9" /></svg></button>
  </form>;
}

function ListaTarefas({ tarefas, alternar, apagar, mudarPrioridade, ordem, edicao }) {
  const [descricoesAbertas, setDescricoesAbertas] = useState({});
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
          <Alca id={t.id} tipo="tarefa" grupo={t.grupoId || null} ordem={ordem} imagem="li" taskData={t} />
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
              {(t.repeteDias > 0 || t.limite || t.comentario) && (
                <span className="ck-meta">
                  {t.repeteDias > 0 && (
                    <span className="ck-repete" title="Volta sozinha, mesmo se você apagar">↻ {rotuloRotina(t.repeteDias, t.repeteHora, t.recorrencia)}</span>
                  )}
                  {t.limite && (() => {
                    const pz = rotuloPrazo(t);
                    return (
                      <span className={`ck-prazo${pz.atrasada ? " ck-atraso" : ""}`} title="Prazo">
                        ⏰ {pz.atrasada ? "atrasada · " : ""}{pz.texto}
                      </span>
                    );
                  })()}
                  {t.comentario && <span className="ck-tarefa-comentario"><IconeComentario tamanho={14} /><span>{t.comentario}</span></span>}
                </span>
              )}
              {t.descricao && descricoesAbertas[t.id] && <span className="ck-descricao">{t.descricao}</span>}
            </span>
          </label>
          {t.descricao && <ToggleDescricao fechada={!descricoesAbertas[t.id]} onClick={() => setDescricoesAbertas((atual) => ({ ...atual, [t.id]: !atual[t.id] }))} />}
          {(() => {
            const prioridadeVisivel = prioridadePeloPrazo(t);
            return <button
            type="button"
            className={`ck-prio p${prioridadeVisivel}`}
            data-tutorial="prioridade"
            onClick={() => mudarPrioridade(t.id)}
            title={`${prioridadeVisivel !== (t.prioridade || 0) ? "Aumentada pelo prazo · " : ""}${PRIORIDADES[prioridadeVisivel].nome} (clique para trocar)`}
            aria-label={`Prioridade: ${PRIORIDADES[prioridadeVisivel].nome}. Clique para trocar.`}
          />;
          })()}
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
          <BotaoApagar nome={`tarefa ${t.texto}`} onClick={() => apagar(t.id)} />
        </li>
      ))}
    </ul>
  );
}

function FormularioAnotacao({ form, onSalvar, onChange, onCancelar }) {
  const formRef = useRef(null);
  useFecharFora(formRef, true, onCancelar);
  return (
    <form ref={formRef} className="ck-form-grupo ck-form-anotacao" onSubmit={onSalvar} onKeyDown={(e) => e.key === "Escape" && onCancelar()}>
      <div className="ck-anotacao-titulo-data"><input id="campo-titulo-anotacao" autoFocus type="text" maxLength={100} placeholder="Título" aria-label="Título da anotação" value={form.titulo} onChange={(e) => onChange((atual) => ({ ...atual, titulo: e.target.value }))} required /><DiaMes value={form.data || ""} onChange={(data) => onChange((atual) => ({ ...atual, data }))} rotulo="Data da anotação (opcional)" /></div>
      <textarea className="ck-campo-largo" rows={4} placeholder="Anotação (opcional)" aria-label="Anotação (opcional)" value={form.texto} onChange={(e) => onChange((atual) => ({ ...atual, texto: e.target.value }))} onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); else enviarAoEnter(e); }} />
      <button type="submit" disabled={!form.titulo.trim()}>Salvar</button>
      <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
    </form>
  );
}

function ConfiguracoesVisuais({ tema, setTema, desfoque, setDesfoque, ajusteFundo, setAjusteFundo, escolherFundo, fundo, removerFundo, erroFundo, janelaAvisos, setJanelaAvisos, excluirSemConfirmacao, setExcluirSemConfirmacao, notificationPreferences, setNotificationPreferences, iniciarTutorial }) {
  return <div className="ck-config-preferencias">
    <section className="ck-pref-card">
      <h3>Tema</h3>
      <p>Escolha como a checklist aparece neste navegador.</p>
      <span className="ck-ajuste ck-ajuste-segmentado" role="group" aria-label="Tema">
        {[['escuro', 'Tema escuro'], ['claro', 'Tema claro']].map(([v, nome]) => <button key={v} type="button" className={`secundario ck-ajuste-btn${tema === v ? ' ativo' : ''}`} aria-pressed={tema === v} onClick={() => setTema(v)}>{nome}</button>)}
      </span>
    </section>
    <section className="ck-pref-card">
      <h3>Guia rápido</h3>
      <p>Veja novamente onde ficam os principais recursos do Crysalis.</p>
      <button type="button" className="secundario" onClick={iniciarTutorial}>Rever tutorial</button>
    </section>
    <section className="ck-pref-card">
      <h3>Exclusão de tarefas</h3>
      <p>Escolha se é necessário confirmar antes de excluir tarefas. A exclusão de sessões sempre pede confirmação.</p>
      <label className="ck-limite-horario">
        <input type="checkbox" checked={excluirSemConfirmacao} onChange={(e) => setExcluirSemConfirmacao(e.target.checked)} />
        <span>Excluir tarefas sem confirmação</span>
      </label>
    </section>
    <section className="ck-pref-card">
      <h3 id="config-notificacoes">Notificações</h3>
      <p>Escolha quais avisos este aparelho e sua conta podem receber.</p>
      <label className="ck-limite-horario"><input type="checkbox" checked={notificationPreferences.checklistSummary} onChange={(e) => setNotificationPreferences((p) => ({ ...p, checklistSummary: e.target.checked }))} /><span>Resumo periódico da checklist</span></label>
      <label className="ck-limite-horario"><input type="checkbox" checked={notificationPreferences.deadlines} onChange={(e) => setNotificationPreferences((p) => ({ ...p, deadlines: e.target.checked }))} /><span>Avisos de prazo</span></label>
      <label className="ck-limite-horario"><input type="checkbox" checked={notificationPreferences.collaboration} onChange={(e) => setNotificationPreferences((p) => ({ ...p, collaboration: e.target.checked }))} /><span>Atualizações de tarefas com amigos e equipes</span></label>
    </section>
    <section className="ck-pref-card">
      <h3>Horário dos lembretes</h3>
      <p>Escolha em que período você quer receber os resumos e os avisos de prazo.</p>
      <label className="ck-limite-horario">
        <input type="checkbox" checked={janelaAvisos.ativa} onChange={(e) => setJanelaAvisos((atual) => ({ ...atual, ativa: e.target.checked }))} />
        <span>Receber lembretes apenas neste período</span>
      </label>
      {janelaAvisos.ativa && <>
        <div className="ck-periodo-avisos">
          <label>Início<Hora24 value={janelaAvisos.inicio} onChange={(inicio) => setJanelaAvisos((atual) => ({ ...atual, inicio }))} rotulo="Início do período de lembretes" /></label>
          <span aria-hidden="true">até</span>
          <label>Fim<Hora24 value={janelaAvisos.fim} onChange={(fim) => setJanelaAvisos((atual) => ({ ...atual, fim }))} rotulo="Fim do período de lembretes" /></label>
        </div>
        <small>Fora desse período, os lembretes ficam pausados. O horário pode atravessar a meia-noite; se início e fim forem iguais, os lembretes ficam liberados o dia todo.</small>
      </>}
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

const ETAPAS_TUTORIAL = [
  {
    titulo: "Boas-vindas ao Crysalis!",
    texto: "Este guia rápido mostra onde ficam os recursos principais. Você pode sair quando quiser pelo botão no alto e rever depois em Configurações.",
  },
  {
    alvo: '[data-tutorial="abas"]',
    titulo: "Checklist e anotações",
    texto: "Alterne entre suas tarefas e suas anotações por estas abas. As duas áreas permitem organizar os itens em sessões.",
  },
  {
    alvo: '[data-tutorial="criar"]',
    titulo: "Crie e organize",
    texto: "Use Adicionar tarefa e Adicionar sessão. Também dá para criar uma tarefa dentro de uma sessão pelo botão + dela. No teclado, Ctrl+F cria um item e Ctrl+D cria uma sessão.",
  },
  {
    alvo: '[data-tutorial="prioridade"]',
    alternativa: '[data-tutorial="criar"]',
    titulo: "Concluir e priorizar",
    texto: "O círculo à esquerda da tarefa marca se ela foi concluída. A bolinha colorida à direita define a prioridade: toque nela para alternar entre tranquila, média e urgente.",
    legenda: true,
  },
  {
    alvo: '[data-tutorial="painel-lateral"]',
    titulo: "Agenda, rotinas e contas",
    texto: "Abaixo do calendário ficam as abas de Rotinas e Contas. No celular, é só rolar a página para encontrar esse painel.",
  },
  {
    alvo: ".ck-cal",
    titulo: "Eventos e Google Agenda",
    texto: "Escolha um dia e adicione um evento ao calendário. Depois, clique no botão Google ao lado dele: o Google Agenda vai abrir com os dados já preenchidos. Lá, é só clicar em Salvar.",
  },
];

function TutorialGuia({ onEncerrar }) {
  const [indice, setIndice] = useState(0);
  const [foco, setFoco] = useState(null);
  const [posicao, setPosicao] = useState({ top: 16, left: 16 });
  const cartaoRef = useRef(null);
  const etapa = ETAPAS_TUTORIAL[indice];

  useEffect(() => {
    let alvo = etapa.alvo ? document.querySelector(etapa.alvo) : null;
    if (!alvo && etapa.alternativa) alvo = document.querySelector(etapa.alternativa);

    const atualizar = () => {
      if (!alvo) {
        setFoco(null);
        return;
      }
      const r = alvo.getBoundingClientRect();
      setFoco({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };

    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const espera = window.setTimeout(atualizar, alvo ? 350 : 0);
    window.addEventListener("resize", atualizar);
    window.addEventListener("scroll", atualizar, true);
    return () => {
      window.clearTimeout(espera);
      window.removeEventListener("resize", atualizar);
      window.removeEventListener("scroll", atualizar, true);
    };
  }, [indice, etapa]);

  useEffect(() => {
    const largura = Math.min(420, window.innerWidth - 28);
    const altura = cartaoRef.current?.getBoundingClientRect().height || 260;
    const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), Math.max(minimo, maximo));
    const left = foco
      ? limitar(foco.left + foco.width / 2 - largura / 2, 14, window.innerWidth - largura - 14)
      : (window.innerWidth - largura) / 2;
    let top = (window.innerHeight - altura) / 2;
    if (foco) {
      const abaixo = foco.top + foco.height + 16;
      top = abaixo + altura <= window.innerHeight - 14 ? abaixo : foco.top - altura - 16;
      top = limitar(top, 14, window.innerHeight - altura - 14);
    }
    setPosicao({ top, left });
  }, [foco, indice]);

  return <div className={`ck-tutorial${foco ? " com-foco" : " sem-foco"}`}>
    <div className="ck-tutorial-bloqueio" aria-hidden="true" />
    {foco && <div className="ck-tutorial-foco" aria-hidden="true" style={{ top: foco.top, left: foco.left, width: foco.width, height: foco.height }} />}
    <section className="ck-tutorial-cartao" role="dialog" aria-modal="true" aria-labelledby="ck-tutorial-titulo" ref={cartaoRef} style={{ top: posicao.top, left: posicao.left }}>
      <div className="ck-tutorial-progresso"><span>{indice + 1} de {ETAPAS_TUTORIAL.length}</span><button type="button" onClick={onEncerrar}>Sair do tutorial</button></div>
      <h2 id="ck-tutorial-titulo" aria-live="polite">{etapa.titulo}</h2>
      <p>{etapa.texto}</p>
      {etapa.legenda && <div className="ck-tutorial-legenda" aria-label="Exemplo dos controles da tarefa">
        <span className="ck-tutorial-exemplo"><i className="ck-tutorial-concluir" />Concluir</span>
        <span className="ck-tutorial-exemplo"><i className="ck-tutorial-prioridade" />Prioridade</span>
        <span className="ck-tutorial-cores" aria-hidden="true"><i /><i /><i /></span>
      </div>}
      <div className="ck-tutorial-acoes">
        {indice > 0 && <button type="button" className="secundario" onClick={() => setIndice((n) => n - 1)}>Voltar</button>}
        <button type="button" onClick={() => indice === ETAPAS_TUTORIAL.length - 1 ? onEncerrar() : setIndice((n) => n + 1)} autoFocus>
          {indice === ETAPAS_TUTORIAL.length - 1 ? "Concluir" : "Próximo"}
        </button>
      </div>
    </section>
  </div>;
}

function ConfiguracaoNomeUsuario({ usuario, onNomeSalvo }) {
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase.from("profiles").select("username").eq("user_id", usuario.id).maybeSingle()
      .then(({ data, error: erroConsulta }) => {
        if (!ativo) return;
        if (erroConsulta) {
          setMensagem("Não consegui carregar seu nome de usuário. Confira se a atualização do Supabase já foi aplicada.");
          setErro(true);
        } else {
          setNome(data?.username || "");
        }
        setCarregando(false);
      });
    return () => { ativo = false; };
  }, [usuario.id]);

  async function salvar(e) {
    e.preventDefault();
    setMensagem("");
    const nomeNormalizado = nome.trim().toLowerCase().replace(/\s+/g, " ");
    if (nomeNormalizado.length < 3 || nomeNormalizado.length > 20 || !/^[a-z0-9_]+(?: [a-z0-9_]+)*$/.test(nomeNormalizado)) {
      setMensagem("Use de 3 a 20 caracteres: letras sem acento, números, espaços ou _.");
      setErro(true);
      return;
    }

    setSalvando(true);
    const { error: erroSalvar } = await supabase.from("profiles").upsert(
      { user_id: usuario.id, username: nomeNormalizado },
      { onConflict: "user_id" },
    );
    if (erroSalvar?.code === "23505") {
      setMensagem("Esse nome de usuário já está em uso. Escolha outro.");
      setErro(true);
    } else if (erroSalvar) {
      setMensagem("Não consegui salvar o nome de usuário. Tente novamente.");
      setErro(true);
    } else {
      setNome(nomeNormalizado);
      onNomeSalvo?.(true);
      setMensagem("Nome de usuário salvo. Você continua entrando com seu email.");
      setErro(false);
    }
    setSalvando(false);
  }

  return <section className="ck-pref-card ck-usuario-card">
    <h3>Nome de usuário</h3>
    <p>Escolha um nome único para sua conta. Por enquanto, o acesso continua sendo pelo email.</p>
    <form className="ck-nome-usuario-form" onSubmit={salvar}>
      <label htmlFor="ck-nome-usuario">Nome de usuário</label>
      <input
        id="ck-nome-usuario"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck="false"
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_]+( [A-Za-z0-9_]+)*"
        placeholder="seu nome"
        value={nome}
        onChange={(e) => setNome(e.target.value.replace(/\s+/g, " "))}
        disabled={carregando || salvando}
        required
      />
      <small className="ck-usuario-dica">3–20 caracteres: letras sem acento. Números, espaços ou _ são permitidos.</small>
      <button type="submit" className="secundario" disabled={carregando || salvando}>
        {carregando ? "Carregando…" : salvando ? "Salvando…" : "Salvar nome de usuário"}
      </button>
      {mensagem && <p className={erro ? "ck-usuario-mensagem erro" : "ck-usuario-mensagem"} role={erro ? "alert" : "status"}>{mensagem}</p>}
    </form>
  </section>;
}

function Checklist({ usuario }) {
  const chaveTutorial = `checklist:tutorial:v1:${usuario.id}`;
  const [tutorialAtivo, setTutorialAtivo] = useState(() => !lerStorage(chaveTutorial, false));
  const [tarefas, setTarefas] = useState(() => lerStorage(STORAGE_TASKS, []));
  const [grupos, setGrupos] = useState(() => lerStorage(STORAGE_GROUPS, []));
  const [eventos, setEventos] = useState(() => lerStorage(STORAGE_EVENTS, []));
  const [avisosAgendaFechados, setAvisosAgendaFechados] = useState(() => lerStorage(STORAGE_AVISOS_AGENDA_FECHADOS, {}));
  const [rotinas, setRotinas] = useState(() => lerStorage(STORAGE_ROUTINES, []));
  const [contas, setContas] = useState(() => lerStorage(STORAGE_BILLS, []));
  const [anotacoes, setAnotacoes] = useState(() => lerStorage(STORAGE_NOTES, []));
  const [sessoesAnotacoes, setSessoesAnotacoes] = useState(() => lerStorage(STORAGE_NOTE_GROUPS, []));
  const [pagina, setPaginaState] = useState("tarefas");
  const [amizadeSelecionada, setAmizadeSelecionada] = useState("");
  const [abaConfiguracoes, setAbaConfiguracoes] = useState("preferencias");
  const paginaRef = useRef(pagina);
  paginaRef.current = pagina;
  const amizadeSelecionadaRef = useRef(amizadeSelecionada);
  amizadeSelecionadaRef.current = amizadeSelecionada;
  const historicoInicializadoRef = useRef(false);
  function setPagina(proxima, detalhes = {}) {
    const amizadeId = proxima === "amizade" ? (detalhes.friendshipId ?? amizadeSelecionadaRef.current) : "";
    const mudou = paginaRef.current !== proxima || (proxima === "amizade" && amizadeSelecionadaRef.current !== amizadeId);
    if (mudou) window.history.pushState({ ...(window.history.state || {}), crysalisPage: proxima, friendshipId: amizadeId }, "");
    paginaRef.current = proxima;
    setPaginaState(proxima);
    amizadeSelecionadaRef.current = amizadeId;
    setAmizadeSelecionada(amizadeId);
  }
  useEffect(() => {
    if (!historicoInicializadoRef.current) {
      const inicio = { ...(window.history.state || {}), crysalisPage: paginaRef.current, friendshipId: amizadeSelecionadaRef.current };
      window.history.replaceState(inicio, "");
      window.history.pushState(inicio, "");
      historicoInicializadoRef.current = true;
    }
    function aoVoltar(event) {
      const paginaAnterior = event.state?.crysalisPage;
      if (["tarefas", "anotacoes", "social", "amizade", "equipes", "configuracoes"].includes(paginaAnterior)) {
        const amizadeId = paginaAnterior === "amizade" ? (event.state.friendshipId || "") : "";
        paginaRef.current = paginaAnterior;
        amizadeSelecionadaRef.current = amizadeId;
        setPaginaState(paginaAnterior);
        setAmizadeSelecionada(amizadeId);
      }
    }
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);
  const [nomeSessaoAnotacao, setNomeSessaoAnotacao] = useState("");
  const [iconeSessaoAnotacao, setIconeSessaoAnotacao] = useState("butterfly");
  const [criandoSessaoAnotacao, setCriandoSessaoAnotacao] = useState(false);
  const [formAnotacao, setFormAnotacao] = useState(null);
  const sessaoAnotacaoNovaRef = useRef(null);
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
  const [janelaAvisos, setJanelaAvisos] = useState(() => normalizarJanelaAvisos(lerStorage(STORAGE_JANELA_AVISOS, JANELA_AVISOS_PADRAO)));
  const [notificationPreferences, setNotificationPreferences] = useState(() => normalizarPreferenciasNotificacao(lerStorage(STORAGE_PREF_NOTIFICACOES, PREFERENCIAS_NOTIFICACAO_PADRAO)));
  const [excluirSemConfirmacao, setExcluirSemConfirmacao] = useState(() => lerStorage(STORAGE_EXCLUIR_SEM_CONFIRMAR, true) !== false);
  const [tema, setTema] = useState(() => (lerStorage(STORAGE_TEMA, "escuro") === "claro" ? "claro" : "escuro"));
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    salvarStorage(STORAGE_TEMA, tema);
  }, [tema]);
  const [msgDados, setMsgDados] = useState({ texto: "", erro: false });
  const [confirmacaoExcluir, setConfirmacaoExcluir] = useState(null);
  const [, setTick] = useState(0);
  const [erroFundo, setErroFundo] = useState("");
  const [editando, setEditando] = useState(null); // id da tarefa em edição
  const [arrastando, setArrastando] = useState(null); // {tipo, id, grupo}
  const [sobre, setSobre] = useState(null);
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [iconeGrupo, setIconeGrupo] = useState("butterfly");
  const [sessaoEmEdicao, setSessaoEmEdicao] = useState(null);
  const [criandoSolta, setCriandoSolta] = useState(false);
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const sessaoChecklistNovaRef = useRef(null);
  const [grupoAdd, setGrupoAdd] = useState(null); // sessão com campo aberto
  useFecharFora(sessaoChecklistNovaRef, criandoGrupo, () => { setCriandoGrupo(false); setNomeGrupo(""); });
  useFecharFora(sessaoAnotacaoNovaRef, criandoSessaoAnotacao, () => { setCriandoSessaoAnotacao(false); setNomeSessaoAnotacao(""); });
  const [notificar, setNotificar] = useState(() =>
    lerStorage(STORAGE_NOTIFY, false)
  );
  const [permissao, setPermissao] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [nomeUsuarioDefinido, setNomeUsuarioDefinido] = useState(null);
  const [avisoNomeFechado, setAvisoNomeFechado] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase.from("profiles").select("username").eq("user_id", usuario.id).maybeSingle()
      .then(({ data, error }) => { if (ativo) setNomeUsuarioDefinido(error ? null : Boolean(data?.username)); });
    return () => { ativo = false; };
  }, [usuario.id]);

  // Mantém os dados atuais acessíveis dentro do setInterval
  const tarefasRef = useRef([]);
  const gruposRef = useRef([]);
  const eventosRef = useRef([]);
  const rotinasRef = useRef([]);
  const contasRef = useRef([]);
  const anotacoesRef = useRef([]);
  const sessoesAnotacoesRef = useRef([]);
  const janelaAvisosRef = useRef(janelaAvisos);
  const notificationPreferencesRef = useRef(notificationPreferences);
  const excluirSemConfirmacaoRef = useRef(excluirSemConfirmacao);
  tarefasRef.current = tarefas;
  gruposRef.current = grupos;
  eventosRef.current = eventos;
  rotinasRef.current = rotinas;
  contasRef.current = contas;
  anotacoesRef.current = anotacoes;
  sessoesAnotacoesRef.current = sessoesAnotacoes;
  janelaAvisosRef.current = janelaAvisos;
  notificationPreferencesRef.current = notificationPreferences;
  excluirSemConfirmacaoRef.current = excluirSemConfirmacao;

  // ---------- sincronização com o Supabase ----------
  const [sync, setSync] = useState("carregando"); // carregando | salvo | salvando | erro | conflito | erro-carregar
  const [nuvemPronta, setNuvemPronta] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const versaoNuvem = useRef(null); // updated_at da última versão que este aparelho viu ou salvou
  const jsonSalvo = useRef(""); // conteúdo da última versão sincronizada
  const salvandoAgora = useRef(false);
  const bloqueado = useRef(false); // true enquanto há conflito pendente

  const jsonAtual = JSON.stringify(empacotar(tarefas, grupos, eventos, rotinas, contas, anotacoes, sessoesAnotacoes, janelaAvisos, excluirSemConfirmacao, notificationPreferences));
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
    setJanelaAvisos(l.janelaAvisos);
    setExcluirSemConfirmacao(l.excluirSemConfirmacao);
    setNotificationPreferences(l.notificationPreferences);
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
            ? empacotar([], [], [], [], [], [], [], JANELA_AVISOS_PADRAO, true, PREFERENCIAS_NOTIFICACAO_PADRAO)
            : empacotar(tarefasRef.current, gruposRef.current, eventosRef.current, rotinasRef.current, contasRef.current, anotacoesRef.current, sessoesAnotacoesRef.current, janelaAvisosRef.current, excluirSemConfirmacaoRef.current, notificationPreferencesRef.current);
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
    const dados = empacotar(tarefasRef.current, gruposRef.current, eventosRef.current, rotinasRef.current, contasRef.current, anotacoesRef.current, sessoesAnotacoesRef.current, janelaAvisosRef.current, excluirSemConfirmacaoRef.current, notificationPreferencesRef.current);
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
    [STORAGE_TASKS, STORAGE_GROUPS, STORAGE_EVENTS, STORAGE_ROUTINES, STORAGE_BILLS, STORAGE_NOTES, STORAGE_NOTE_GROUPS, STORAGE_JANELA_AVISOS, STORAGE_PREF_NOTIFICACOES, STORAGE_EXCLUIR_SEM_CONFIRMAR, STORAGE_DONO, STORAGE_PRAZOS, STORAGE_LAST].forEach((k) => {
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
  useEffect(() => { salvarStorage(STORAGE_JANELA_AVISOS, janelaAvisos); }, [janelaAvisos]);
  useEffect(() => { salvarStorage(STORAGE_PREF_NOTIFICACOES, notificationPreferences); }, [notificationPreferences]);
  useEffect(() => { salvarStorage(STORAGE_EXCLUIR_SEM_CONFIRMAR, excluirSemConfirmacao); }, [excluirSemConfirmacao]);

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
        notificationPreferencesRef.current.checklistSummary &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        lerStorage(STORAGE_NOTIFY, false) &&
        horarioPermiteAvisos(lerStorage(STORAGE_JANELA_AVISOS, JANELA_AVISOS_PADRAO), agora)
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
            rotinaId: r.id, repeteDias: r.cada, repeteHora: r.hora || "00:00", recorrencia: r.recorrencia,
            limite: (r.limite || r.limiteHora) ? r.proxima : "", limiteHora: r.limiteHora || "", criadaEm: Date.now(),
            descricao: r.descricao || "", comentario: r.comentario || "",
          })),
      ]);
      setRotinas((atual) =>
        atual.map((r) => (vencida(r) ? { ...r, proxima: proximaDataRotina(hoje, r.recorrencia || recorrenciaSimples(r.cada)) } : r))
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
  const hoje = iso(new Date());
  const tarefasVisiveis = tarefas.filter((t) => !t.agendadaPara || t.agendadaPara <= hoje);
  const tarefasFuturas = tarefas.filter((t) => t.agendadaPara && t.agendadaPara > hoje);
  const soltas = tarefasVisiveis.filter((t) => !t.grupoId || !idsGrupos.has(t.grupoId));
  const pendentes = tarefasVisiveis.filter((t) => !t.feita);
  const feitas = tarefasVisiveis.length - pendentes.length;
  const meias = pendentes.filter((t) => t.meio).length;

  // avisos extras perto do prazo: 45 min antes (lembrete) e 15 min antes (chamadão)
  function verificarPrazos() {
    if (!notificationPreferences.deadlines) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const agora = new Date();
    if (!horarioPermiteAvisos(janelaAvisos, agora)) return;
    const vistos = lerStorage(STORAGE_PRAZOS, {});
    let mudou = false;

    tarefasRef.current.forEach((t) => {
      if (t.agendadaPara && t.agendadaPara > iso(agora)) return;
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
    if (!notificationPreferences.checklistSummary) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const agora = new Date();
    const hoje = iso(agora);
    const todas = tarefasRef.current.filter((t) => !t.feita && (!t.agendadaPara || t.agendadaPara <= hoje));
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
      const agora = new Date();
      if (!horarioPermiteAvisos(janelaAvisos, agora)) {
        salvarStorage(STORAGE_LAST, slotAtual(intervaloAviso));
        return;
      }
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
    // A função usa refs mutáveis e `janelaAvisos`, já declarada como dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificar, permissao, intervaloAviso, pushAtivo, janelaAvisos, notificationPreferences]);

  function mudarIntervalo(minutos) {
    setIntervaloAviso(minutos);
    salvarStorage(STORAGE_INTERVALO, minutos);
    salvarStorage(STORAGE_LAST, slotAtual(minutos)); // recomeça a contar a partir de agora
    if (pushAtivo) atualizarPush(minutos).catch(() => setAvisoPush("Não consegui atualizar o intervalo no servidor."));
  }

  function abrirPreferenciasNotificacao() {
    setAbaConfiguracoes("preferencias");
    setPagina("configuracoes");
    window.setTimeout(() => document.getElementById("config-notificacoes")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
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
    const recorrencia = prazo.recorrencia || recorrenciaSimples(repetirDias);
    const cada = intervaloLegado(recorrencia);
    if (recorrencia) {
      rotinaId = novoId();
      setRotinas((atual) => [
        ...atual,
        { id: rotinaId, texto, cada, recorrencia, hora, grupoId, prioridade: 0,
          proxima: proximaDataRotina(iso(new Date()), recorrencia), descricao: (prazo.descricao || "").trim(), comentario: (prazo.comentario || "").trim(),
          limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "" },
      ]);
    }
    setTarefas((atual) => [
      ...atual,
      { id: novoId(), texto, feita: false, grupoId, rotinaId, repeteDias: cada, repeteHora: hora, recorrencia, criadaEm: Date.now(),
        limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "",
        descricao: (prazo.descricao || "").trim(), comentario: (prazo.comentario || "").trim() },
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

  function dispensarAvisoAgenda(evento) {
    const chave = `${evento.id}:${evento.data}`;
    setAvisosAgendaFechados((atual) => {
      const novos = { ...atual, [chave]: true };
      salvarStorage(STORAGE_AVISOS_AGENDA_FECHADOS, novos);
      return novos;
    });
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

  function editarRotina(id, campos) {
    setRotinas((atual) => atual.map((r) => r.id === id ? { ...r, ...campos } : r));
    setTarefas((atual) => atual.map((t) => t.rotinaId === id && !t.feita ? {
      ...t,
      texto: campos.texto,
      repeteDias: campos.cada,
      repeteHora: campos.hora,
      recorrencia: campos.recorrencia,
      limite: campos.limite || "",
      limiteHora: campos.limite ? campos.limiteHora || "" : "",
      descricao: campos.descricao,
      comentario: campos.comentario || "",
      grupoId: campos.grupoId,
    } : t));
  }

  function apagar(id) {
    const tarefa = tarefas.find((item) => item.id === id);
    if (!tarefa) return;
    if (excluirSemConfirmacao) {
      setTarefas((atual) => atual.filter((item) => item.id !== id));
      return;
    }
    setConfirmacaoExcluir({
      title: "Excluir tarefa?",
      message: `Deseja mesmo excluir “${tarefa.texto}” da sua checklist?`,
      action: "Excluir tarefa",
      confirm: () => setTarefas((atual) => atual.filter((item) => item.id !== id)),
    });
  }

  function moverTarefaParaSocial(id) {
    const tarefa = tarefas.find((item) => item.id === id);
    if (!tarefa) return;
    setTarefas((atual) => atual.filter((item) => item.id !== id));
    if (tarefa.rotinaId) setRotinas((atual) => atual.filter((rotina) => rotina.id !== tarefa.rotinaId));
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
    const recorrencia = prazo.recorrencia || recorrenciaSimples(dias);
    const cada = intervaloLegado(recorrencia);

    if (recorrencia && rotina) {
      rotinaId = rotina.id; // já repetia: atualiza nome, intervalo e horário
      setRotinas((a) =>
        a.map((r) =>
          r.id === rotina.id
            ? { ...r, texto, cada, recorrencia, hora, limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "", descricao: (prazo.descricao || "").trim(), comentario: (prazo.comentario || "").trim(), proxima: JSON.stringify(recorrencia) === JSON.stringify(r.recorrencia || recorrenciaSimples(r.cada)) ? r.proxima : proximaDataRotina(iso(new Date()), recorrencia) }
            : r
        )
      );
    } else if (recorrencia) {
      rotinaId = novoId(); // passou a repetir
      setRotinas((a) => [
        ...a,
        { id: rotinaId, texto, cada, recorrencia, hora, limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "", descricao: (prazo.descricao || "").trim(), comentario: (prazo.comentario || "").trim(), grupoId: t.grupoId || null, prioridade: t.prioridade || 0, proxima: proximaDataRotina(t.agendadaPara || iso(new Date()), recorrencia) },
      ]);
    } else if (rotina) {
      setRotinas((a) => a.filter((r) => r.id !== rotina.id)); // parou de repetir
    }

    setTarefas((a) =>
      a.map((x) => (x.id === id ? {
        ...x, texto, repeteDias: cada, repeteHora: recorrencia ? hora : undefined, recorrencia, rotinaId, criadaEm: x.criadaEm || Number(x.id) || Date.now(),
        limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "",
        descricao: (prazo.descricao || "").trim(),
        comentario: (prazo.comentario || "").trim(),
        ...(prazo.agendadaPara ? { agendadaPara: prazo.agendadaPara } : {}),
      } : x))
    );
    setEditando(null);
  }

  const edicao = { id: editando, abrir: setEditando, cancelar: () => setEditando(null), salvar: salvarEdicao };

  function adicionarConta(c) {
    const ciclo = iso(new Date()).slice(0, 7);
    setContas((a) => [...a, { id: novoId(), ...c, ciclo, parcela: 1, pago: false }]);
  }

  function editarConta(id, campos) {
    setContas((atual) => atual.map((c) => c.id === id ? { ...c, ...campos, ...(campos.total === 0 ? { parcela: 1 } : {}) } : c));
  }

  function salvarAnotacao(e) {
    e.preventDefault();
    const titulo = formAnotacao?.titulo?.trim();
    const texto = formAnotacao?.texto?.trim();
    if (!titulo) return;
    const item = { id: formAnotacao.id || novoId(), titulo, texto: texto || "", data: formAnotacao.data || null, sessaoId: formAnotacao.sessaoId || null };
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
    setSessoesAnotacoes((a) => [...a, { id: novoId(), nome, icone: iconeSessaoAnotacao, aberta: true }]);
    setNomeSessaoAnotacao("");
    setIconeSessaoAnotacao("butterfly");
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
      janelaAvisos,
      excluirSemConfirmacao,
      notificationPreferences,
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
      const ja = normalizarJanelaAvisos(dados.janelaAvisos);
      const prefNotificacoes = normalizarPreferenciasNotificacao(dados.notificationPreferences);
      const excluirSemConfirmacaoImportado = dados.excluirSemConfirmacao !== false;
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
      setJanelaAvisos(ja);
      setNotificationPreferences(prefNotificacoes);
      setExcluirSemConfirmacao(excluirSemConfirmacaoImportado);
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
    setGrupos((atual) => [...atual, { id: novoId(), nome: limpo, icone: iconeGrupo, aberta: true }]);
    setNomeGrupo("");
    setIconeGrupo("butterfly");
    setCriandoGrupo(false);
  }

  function iniciarEdicaoSessao(tipo, sessao) {
    setSessaoEmEdicao({ tipo, id: sessao.id, nome: sessao.nome, icone: sessao.icone || "butterfly" });
  }

  function salvarNomeSessao(tipo, id, nome, icone) {
    const atualizar = tipo === "checklist" ? setGrupos : setSessoesAnotacoes;
    atualizar((itens) => itens.map((sessao) => sessao.id === id ? { ...sessao, nome, ...(icone ? { icone } : {}) } : sessao));
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
    setConfirmacaoExcluir({
      title: "Excluir sessão?",
      message: qtd > 0
        ? `Deseja excluir “${grupo.nome}”? As ${qtd} tarefa${qtd === 1 ? "" : "s"} atuais e as próximas repetições serão movidas para “Sem sessão”.`
        : `Deseja excluir “${grupo.nome}”?`,
      action: "Excluir sessão",
      confirm: () => {
        setGrupos((atual) => atual.filter((item) => item.id !== grupo.id));
        setTarefas((atual) => atual.map((item) => item.grupoId === grupo.id ? { ...item, grupoId: null } : item));
        setRotinas((atual) => atual.map((item) => item.grupoId === grupo.id ? { ...item, grupoId: null } : item));
      },
    });
  }

  function agendarTarefa(texto, data, repetirDias = 0, hora = "00:00", prazo = {}) {
    const agendadaPara = data || iso(new Date());
    const descricao = (prazo.descricao || "").trim();
    const comentario = (prazo.comentario || "").trim();
    const recorrencia = prazo.recorrencia || recorrenciaSimples(repetirDias);
    const cada = intervaloLegado(recorrencia);
    let rotinaId;
    if (recorrencia) {
      rotinaId = novoId();
      setRotinas((atual) => [...atual, {
        id: rotinaId, texto, cada, recorrencia, hora, grupoId: null, prioridade: 0,
        proxima: proximaDataRotina(agendadaPara, recorrencia), descricao, comentario,
        limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "",
      }]);
    }
    setTarefas((atual) => [...atual, {
      id: novoId(), texto, feita: false, meio: false, grupoId: null,
      rotinaId, repeteDias: cada, repeteHora: hora, recorrencia, criadaEm: Date.now(),
      limite: prazo.limite || "", limiteHora: prazo.limite ? prazo.limiteHora || "" : "",
      descricao, comentario, prioridade: 0, agendadaPara,
    }]);
  }

  const ativo = notificar && permissao === "granted";
  function encerrarTutorial() {
    salvarStorage(chaveTutorial, true);
    setTutorialAtivo(false);
  }
  function iniciarTutorial() {
    setPagina("tarefas");
    setAbaConfiguracoes("preferencias");
    setTutorialAtivo(true);
  }

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
  const agoraAvisoAgenda = new Date();
  const avisosDeHoje = eventos.filter((evento) => {
    if (avisosAgendaFechados[`${evento.id}:${evento.data}`]) return false;
    if (evento.data !== iso(agoraAvisoAgenda)) return false;
    const inicioDia = new Date(`${evento.data}T00:01:00`);
    if (!evento.hora) return agoraAvisoAgenda >= inicioDia;
    const inicio = new Date(`${evento.data}T${evento.hora}:00`);
    return agoraAvisoAgenda >= inicioDia && agoraAvisoAgenda <= new Date(inicio.getTime() + 60 * 60 * 1000);
  });

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
            <button type="button" className="ck-topo-marca" onClick={() => setPagina("tarefas")} title="Voltar ao início" aria-label="Voltar à tela inicial do Crysalis">
              <img className="ck-logo-topo" src={`${import.meta.env.BASE_URL}Logo.svg`} alt="" aria-hidden="true" />
              <h1>Crysalis</h1>
            </button>
        <span className="ck-contagem">
          {tarefasVisiveis.length === 0
            ? tarefasFuturas.length > 0 ? `${tarefasFuturas.length} tarefa${tarefasFuturas.length === 1 ? "" : "s"} agendada${tarefasFuturas.length === 1 ? "" : "s"}` : "Nenhuma tarefa"
            :
            `${feitas} de ${tarefasVisiveis.length} concluídas${
                meias > 0 ? ` · ${meias} pela metade` : ""
              }`}
        </span>
          </div>
          <div className="ck-topo-botoes">
          <span className={`ck-sync ck-sync-${sync}`} role="status" title="Sincronização com a nuvem">
            {{ salvando: "Salvando…", salvo: "Salvo", erro: "Sem conexão", conflito: "Conflito" }[sync] || ""}
          </span>

          <button type="button" className="ck-social-nav" onClick={() => setPagina("social")} title="Social" aria-label="Abrir Social">
            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="6.5" r="2.5" /><circle cx="14" cy="7.5" r="2" /><path d="M2 16c.3-2.7 2.1-4.2 5-4.2s4.7 1.5 5 4.2M12 12.3c2.8-.6 5.2.9 5.7 3.7" /></svg><span>Social</span>
          </button>
          <button type="button" className="ck-social-nav" onClick={() => setPagina("equipes")} title="Equipes" aria-label="Abrir equipes"><svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="14" cy="6" r="2.4"/><path d="M1.8 16c.3-2.7 1.8-4 4.2-4h.2m11.9 4c-.3-2.7-1.8-4-4.2-4h-.2M6 16c.3-3.4 1.6-5 4-5s3.7 1.6 4 5"/></svg><span>Equipes</span></button>
          <button type="button" className="ck-icone" data-tutorial="configuracoes" onClick={() => setPagina("configuracoes")} title="Configurações" aria-label="Abrir configurações">
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

      {avisosDeHoje.length > 0 && <section className="ck-aviso-agenda" aria-label="Avisos da agenda">
        {avisosDeHoje.map((evento) => <p key={evento.id}>
          <img className="ck-aviso-agenda-icone" src={`${import.meta.env.BASE_URL}Logo.svg`} alt="" aria-hidden="true" />
          <span>{evento.hora ? <>Hoje às <strong>{evento.hora}</strong> é dia de <strong>{evento.titulo}</strong>.</> : <>Hoje é dia de <strong>{evento.titulo}</strong>.</>}</span>
          <button type="button" className="ck-aviso-agenda-fechar" onClick={() => dispensarAvisoAgenda(evento)} aria-label={`Dispensar aviso de ${evento.titulo}`} title="Fechar aviso">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m4 4 8 8m0-8-8 8" /></svg>
          </button>
        </p>)}
      </section>}
      {nomeUsuarioDefinido === false && !avisoNomeFechado && <section className="ck-aviso-agenda ck-aviso-usuario" aria-label="Lembrete de nome de usuário">
        <p>
          <img className="ck-aviso-agenda-icone" src={`${import.meta.env.BASE_URL}Logo.svg`} alt="" aria-hidden="true" />
          <span>Adicione um nome de usuário para que seus amigos encontrem você no Social. <button type="button" className="ck-aviso-link" onClick={() => { setAbaConfiguracoes("conta"); setPagina("configuracoes"); }}>Ir até as configurações</button></span>
          <button type="button" className="ck-aviso-agenda-fechar" onClick={() => setAvisoNomeFechado(true)} aria-label="Fechar lembrete de nome de usuário" title="Fechar aviso"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m4 4 8 8m0-8-8 8" /></svg></button>
        </p>
      </section>}

      {pagina !== "amizade" && <div className="ck-abas ck-abas-principais" role="tablist" aria-label="Área principal" data-tutorial="abas">
        <button type="button" role="tab" className="ck-aba" aria-selected={pagina === "tarefas"} onClick={() => setPagina("tarefas")}>Checklist</button>
        <button type="button" role="tab" className="ck-aba" aria-selected={pagina === "anotacoes"} onClick={() => setPagina("anotacoes")}>Anotações</button>
      </div>}
      {pagina === "configuracoes" && <section className="ck-configuracoes">
        <div className="ck-config-titulo"><h2>Configurações</h2></div>
        <div className="ck-abas ck-abas-principais" role="tablist" aria-label="Categorias de configurações">
          <button type="button" role="tab" className="ck-aba" aria-selected={abaConfiguracoes === "preferencias"} onClick={() => setAbaConfiguracoes("preferencias")}>Preferências</button>
          <button type="button" role="tab" className="ck-aba" aria-selected={abaConfiguracoes === "conta"} onClick={() => setAbaConfiguracoes("conta")}>Conta</button>
        </div>
        {abaConfiguracoes === "preferencias" ? <ConfiguracoesVisuais tema={tema} setTema={setTema} desfoque={desfoque} setDesfoque={setDesfoque} ajusteFundo={ajusteFundo} setAjusteFundo={setAjusteFundo} escolherFundo={escolherFundo} fundo={fundo} removerFundo={removerFundo} erroFundo={erroFundo} janelaAvisos={janelaAvisos} setJanelaAvisos={setJanelaAvisos} excluirSemConfirmacao={excluirSemConfirmacao} setExcluirSemConfirmacao={setExcluirSemConfirmacao} notificationPreferences={notificationPreferences} setNotificationPreferences={setNotificationPreferences} iniciarTutorial={iniciarTutorial} /> : <section className="ck-conta-config">
          <div className="ck-conta-identidade"><span className="ck-conta-avatar" aria-hidden="true">{(usuario.email || "?").slice(0, 1).toUpperCase()}</span><div><small>Conta conectada</small><strong>{usuario.email}</strong></div></div>
          <ConfiguracaoNomeUsuario usuario={usuario} onNomeSalvo={setNomeUsuarioDefinido} />
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
      {pagina === "amizade" ? <section className="ck-social-page-wrap ck-social-detail-page"><Social user={usuario} view="friend-detail" friendshipId={amizadeSelecionada} excluirSemConfirmacao={excluirSemConfirmacao} onBack={() => { setPagina("tarefas"); setAmizadeSelecionada(""); }} /></section> : pagina === "tarefas" ? <>
      <div className="ck-barras-topo" data-tutorial="criar">
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
          ref={sessaoChecklistNovaRef}
          className="ck-nova-divisao"
          onSubmit={criarGrupo}
        >
          <SeletorIconeSessao value={iconeGrupo} onChange={setIconeGrupo} />
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

      {tarefasVisiveis.length === 0 && grupos.length === 0 && tarefasFuturas.length > 0 && (
        <p className="ck-vazio">
          As tarefas agendadas aparecem aqui a partir da data escolhida.
        </p>
      )}

      {grupos.map((g) => {
        const doGrupo = tarefasVisiveis.filter((t) => t.grupoId === g.id);
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
                onSalvar={(nome, icone) => salvarNomeSessao("checklist", g.id, nome, icone)}
                onCancelar={() => cancelarEdicaoSessao("checklist", g.id)}
              /> : <button
                type="button"
                className="ck-grupo-titulo"
                onClick={() => alternarGrupo(g.id)}
                aria-expanded={aberta}
              >
                <span className={`ck-seta ${aberta ? "aberta" : ""}`}>›</span>
                <IconeSessao icone={g.icone} monocromatico />
                <span className="ck-grupo-nome">{g.nome}</span>
                <span className="ck-grupo-qtd">
                  {feitasGrupo}/{doGrupo.length}
                </span>
              </button>}
              {sessaoEmEdicao?.tipo !== "checklist" || sessaoEmEdicao.id !== g.id ? <button
                type="button"
                className="ck-mais ck-mais-circular"
                onClick={() => abrirAddTarefa(g)}
                onMouseDown={(e) => e.preventDefault()}
                title="Nova tarefa nesta sessão"
                aria-label={`Nova tarefa em ${g.nome}`}
                aria-expanded={grupoAdd === g.id}
              >
                <IconeMais />
              </button> : null}
              {sessaoEmEdicao?.tipo !== "checklist" || sessaoEmEdicao.id !== g.id ? <button type="button" className="ck-icone" title="Editar sessão" aria-label={`Editar sessão ${g.nome}`} onClick={() => iniciarEdicaoSessao("checklist", g)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button> : null}
              {sessaoEmEdicao?.tipo !== "checklist" || sessaoEmEdicao.id !== g.id ? <BotaoApagar nome={`sessão ${g.nome}`} onClick={() => apagarGrupo(g)} /> : null}
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
                  <p className="ck-vazio-grupo">{tarefas.some((t) => t.grupoId === g.id && t.agendadaPara > hoje) ? "As tarefas agendadas aparecerão aqui a partir da data escolhida." : "Nenhuma tarefa aqui ainda."}</p>
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

      {tarefas.length === 0 && grupos.length === 0 && <p className="ck-intro-organizacao">Lembre-se: cresça no seu tempo</p>}

      <h2 className={`ck-secao${ordem.sobre === "__sem_sessao__" && ordem.arrastando?.tipo === "tarefa" ? " alvo" : ""}`} {...alvoProps(ordem, "destinoTarefas", "__sem_sessao__", null)}>Sem sessão</h2>

      {soltas.length > 0 ? (
        <ListaTarefas
          tarefas={soltas}
          alternar={alternar}
          apagar={apagar}
          mudarPrioridade={mudarPrioridade}
          ordem={ordem}
          edicao={edicao}
        />
      ) : <p className="ck-vazio-grupo">Nenhuma tarefa aqui ainda.</p>}

      <Social user={usuario} view="tasks" excluirSemConfirmacao={excluirSemConfirmacao} onManage={() => setPagina("social")} onOpenFriend={(id) => setPagina("amizade", { friendshipId: id })} onMovePersonalTask={moverTarefaParaSocial} />

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
              <button type="button" className="ck-icone ck-aviso-config" onClick={abrirPreferenciasNotificacao} title="Configurar quais notificações receber" aria-label="Configurar notificações"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.8h3l.4 1.7a5 5 0 0 1 1.2.7l1.7-.5 1.5 2.6-1.3 1.2v1.4l1.3 1.2-1.5 2.6-1.7-.5a5 5 0 0 1-1.2.7l-.4 1.7h-3l-.4-1.7a5 5 0 0 1-1.2-.7l-1.7.5-1.5-2.6L3 8.9V7.5L1.7 6.3l1.5-2.6 1.7.5a5 5 0 0 1 1.2-.7z"/><circle cx="8" cy="8.2" r="2.1"/></svg></button>
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
      </> : pagina === "social" ? <section className="ck-social-page-wrap"><Social user={usuario} view="manage" /></section> : pagina === "equipes" ? <section className="ck-social-page-wrap ck-social-detail-page"><Equipes user={usuario} excluirSemConfirmacao={excluirSemConfirmacao} /></section> : pagina === "anotacoes" ? <section className="ck-anotacoes">
        <div className="ck-barras-topo">
          {formAnotacao && !formAnotacao.id && (!formAnotacao.sessaoId || !sessoesAnotacoes.some((s) => s.id === formAnotacao.sessaoId)) ? <FormularioAnotacao form={formAnotacao} onSalvar={salvarAnotacao} onChange={setFormAnotacao} onCancelar={() => setFormAnotacao(null)} /> : <BarraMais rotulo="Adicionar anotação" atalho={ATALHO_TAREFA} onClick={() => abrirNovaAnotacao()} />}
          {criandoSessaoAnotacao ? <form ref={sessaoAnotacaoNovaRef} className="ck-nova-divisao" onSubmit={criarSessaoAnotacao}>
            <SeletorIconeSessao value={iconeSessaoAnotacao} onChange={setIconeSessaoAnotacao} />
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
              onSalvar={(nome, icone) => salvarNomeSessao("anotacoes", s.id, nome, icone)}
              onCancelar={() => cancelarEdicaoSessao("anotacoes", s.id)}
            /> : <button type="button" className="ck-grupo-titulo" aria-expanded={s.aberta !== false} onClick={() => setSessoesAnotacoes((atual) => atual.map((x) => x.id === s.id ? { ...x, aberta: x.aberta === false } : x))}><span className={`ck-seta ${s.aberta !== false ? "aberta" : ""}`}>›</span><IconeSessao icone={s.icone} monocromatico /><span className="ck-grupo-nome">{s.nome}</span><span className="ck-grupo-qtd">{anotacoes.filter((a) => a.sessaoId === s.id).length}</span></button>}
            {sessaoEmEdicao?.tipo !== "anotacoes" || sessaoEmEdicao.id !== s.id ? <button type="button" className="ck-mais" onClick={() => abrirNovaAnotacao(s.id)} title={`Nova anotação em ${s.nome}`} aria-label={`Nova anotação em ${s.nome}`}><IconeMais /></button> : null}
            {sessaoEmEdicao?.tipo !== "anotacoes" || sessaoEmEdicao.id !== s.id ? <button type="button" className="ck-icone" title="Editar sessão" aria-label={`Editar sessão ${s.nome}`} onClick={() => iniciarEdicaoSessao("anotacoes", s)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button> : null}
            {sessaoEmEdicao?.tipo !== "anotacoes" || sessaoEmEdicao.id !== s.id ? <BotaoApagar nome={`sessão ${s.nome}`} onClick={() => { if (window.confirm(`Apagar a sessão "${s.nome}"? As anotações vão para Sem sessão.`)) { setSessoesAnotacoes((xs) => xs.filter((x) => x.id !== s.id)); setAnotacoes((xs) => xs.map((a) => a.sessaoId === s.id ? { ...a, sessaoId: null } : a)); } }} /> : null}
          </div>
          {formAnotacao?.sessaoId === s.id && <FormularioAnotacao form={formAnotacao} onSalvar={salvarAnotacao} onChange={setFormAnotacao} onCancelar={() => setFormAnotacao(null)} />}
          {s.aberta !== false && anotacoes.filter((a) => a.sessaoId === s.id).map((a) => <article className={`ck-anotacao${ordem.sobre === a.id && ordem.arrastando?.tipo === "anotacao" ? " alvo" : ""}`} key={a.id} {...alvoProps(ordem, "anotacao", a.id, s.id)}>
            <Alca id={a.id} tipo="anotacao" grupo={s.id} ordem={ordem} imagem=".ck-anotacao" />
            <div className="ck-anotacao-corpo"><div><strong>{a.titulo}</strong>{a.data && <time>{new Date(`${a.data}T00:00`).toLocaleDateString("pt-BR")}</time>}</div>{a.texto && !descricoesAnotacaoFechadas[a.id] && <p>{a.texto}</p>}</div>{a.texto && <ToggleDescricao fechada={descricoesAnotacaoFechadas[a.id]} onClick={() => setDescricoesAnotacaoFechadas((atual) => ({ ...atual, [a.id]: !atual[a.id] }))} />}<button type="button" className="ck-icone" title="Editar anotação" aria-label={`Editar ${a.titulo}`} onClick={() => setFormAnotacao({ ...a })}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button><BotaoApagar nome={`anotação ${a.titulo}`} onClick={() => setAnotacoes((xs) => xs.filter((x) => x.id !== a.id))} />
          </article>)}
        </section>)}
        {(anotacoes.some((a) => !a.sessaoId || !sessoesAnotacoes.some((s) => s.id === a.sessaoId)) || arrastando?.tipo === "anotacao") && <section className="ck-grupo"><h2 className={`ck-secao${ordem.sobre === "__sem_sessao__" && ordem.arrastando?.tipo === "anotacao" ? " alvo" : ""}`} {...alvoProps(ordem, "destinoAnotacoes", "__sem_sessao__", null)}>Sem sessão</h2>{anotacoes.filter((a) => !a.sessaoId || !sessoesAnotacoes.some((s) => s.id === a.sessaoId)).map((a) => <article className={`ck-anotacao${ordem.sobre === a.id && ordem.arrastando?.tipo === "anotacao" ? " alvo" : ""}`} key={a.id} {...alvoProps(ordem, "anotacao", a.id, null)}><Alca id={a.id} tipo="anotacao" grupo={null} ordem={ordem} imagem=".ck-anotacao" /><div className="ck-anotacao-corpo"><div><strong>{a.titulo}</strong>{a.data && <time>{new Date(`${a.data}T00:00`).toLocaleDateString("pt-BR")}</time>}</div>{a.texto && !descricoesAnotacaoFechadas[a.id] && <p>{a.texto}</p>}</div>{a.texto && <ToggleDescricao fechada={descricoesAnotacaoFechadas[a.id]} onClick={() => setDescricoesAnotacaoFechadas((atual) => ({ ...atual, [a.id]: !atual[a.id] }))} />}<button type="button" className="ck-icone" title="Editar anotação" aria-label={`Editar ${a.titulo}`} onClick={() => setFormAnotacao({ ...a })}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button><BotaoApagar nome={`anotação ${a.titulo}`} onClick={() => setAnotacoes((xs) => xs.filter((x) => x.id !== a.id))} /></article>)}</section>}
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
                <span aria-hidden="true"> V0.9 </span>
      </footer>
    </main>

    <aside className="ck-lateral">
      <Calendario eventos={eventos} tarefasAgendadas={tarefas.filter((t) => t.agendadaPara)} adicionar={adicionarEvento} editar={editarEvento} apagar={apagarEvento} agendarTarefa={agendarTarefa} editarTarefa={salvarEdicao} apagarTarefa={apagar} alternarTarefaAgendada={alternar} />
      <section className="ck-painel" data-tutorial="painel-lateral">
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
          <Rotinas rotinas={rotinas} grupos={grupos} apagar={apagarRotina} mudarPrioridade={mudarPrioridadeRotina} editar={editarRotina} />
        ) : (
          <Contas contas={contas} adicionar={adicionarConta} alternar={alternarConta} apagar={apagarConta} definirValor={definirValorConta} editar={editarConta} />
        )}
      </section>
    </aside>
    <ConfirmacaoChecklist dialog={confirmacaoExcluir} onCancel={() => setConfirmacaoExcluir(null)} onConfirm={() => { confirmacaoExcluir?.confirm(); setConfirmacaoExcluir(null); }} />
    {tutorialAtivo && <TutorialGuia onEncerrar={encerrarTutorial} />}
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
