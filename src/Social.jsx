import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./services/supabase";
import { scheduleCollaborationNotificationDispatch } from "./services/collaborationNotifications";

const z2 = (n) => String(n).padStart(2, "0");
function lerPreferenciaLocal(chave, padrao) {
  try { const valor = localStorage.getItem(chave); return valor == null ? padrao : JSON.parse(valor); }
  catch { return padrao; }
}
function salvarPreferenciaLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento opcional */ }
}
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`; };
const OPCOES_REPETE = [["0", "Não repete"], ["1", "Todo dia"], ["3", "A cada 3 dias"], ["30", "Uma vez por mês"], ["personalizado", "Intervalo personalizado"]];
const DIAS_SEMANA = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];

function dataSeguinte(dd, mm, anterior = "") {
  if (!dd || !mm) return "";
  if (anterior && anterior.slice(5, 7) === mm && anterior.slice(8, 10) === dd) return anterior;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  for (let ano = hoje.getFullYear(); ano <= hoje.getFullYear() + 4; ano++) {
    const d = new Date(ano, Number(mm) - 1, Number(dd));
    if (d.getMonth() === Number(mm) - 1 && d.getDate() === Number(dd) && d >= hoje) return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
  }
  return "";
}

function DataDiaMes({ value, onChange, rotulo = "Prazo: dia e mês" }) {
  const [dia, setDia] = useState(value?.slice(8, 10) || "");
  const [mes, setMes] = useState(value?.slice(5, 7) || "");
  useEffect(() => { setDia(value?.slice(8, 10) || ""); setMes(value?.slice(5, 7) || ""); }, [value]);
  return <span className="ck-hora24 ck-social-diammes" role="group" aria-label={rotulo}>
    <input type="text" inputMode="numeric" maxLength={2} placeholder="dd" value={dia} aria-label="Dia do prazo" onChange={(e) => { let d = e.target.value.replace(/\D/g, "").slice(0, 2); if (d.length === 1 && Number(d) > 3) d = `0${d}`; if (Number(d) > 31) d = "31"; setDia(d); onChange(dataSeguinte(d, mes, value)); }} onBlur={() => { const d = dia ? dia.padStart(2, "0") : ""; setDia(d); onChange(dataSeguinte(d, mes, value)); }} />
    <span aria-hidden="true">/</span>
    <input type="text" inputMode="numeric" maxLength={2} placeholder="mm" value={mes} aria-label="Mês do prazo" onChange={(e) => { let m = e.target.value.replace(/\D/g, "").slice(0, 2); if (m.length === 1 && Number(m) > 1) m = `0${m}`; if (Number(m) > 12) m = "12"; setMes(m); onChange(dataSeguinte(dia, m, value)); }} onBlur={() => { const m = mes ? mes.padStart(2, "0") : ""; setMes(m); onChange(dataSeguinte(dia, m, value)); }} />
  </span>;
}

function Hora24Social({ value, onChange, rotulo, opcional = false }) {
  const [h, setH] = useState(value ? value.slice(0, 2) : "");
  const [m, setM] = useState(value ? value.slice(3, 5) : "");
  useEffect(() => { setH(value ? value.slice(0, 2) : ""); setM(value ? value.slice(3, 5) : ""); }, [value]);
  const digitar = (v, campo) => {
    const s = v.replace(/\D/g, "").slice(0, 2);
    const max = campo === "h" ? 23 : 59;
    const bounded = s.length === 2 && Number(s) > max ? String(max) : s;
    const hh = campo === "h" ? bounded : h;
    const mm = campo === "m" ? bounded : m;
    if (campo === "h") setH(bounded); else setM(bounded);
    onChange(hh && mm ? `${z2(Number(hh))}:${z2(Number(mm))}` : "");
  };
  const sair = (campo) => {
    const current = campo === "h" ? h : m;
    if (!current) return;
    const normalized = z2(Number(current));
    if (campo === "h") setH(normalized); else setM(normalized);
    const hh = campo === "h" ? normalized : h; const mm = campo === "m" ? normalized : m;
    onChange(hh && mm ? `${z2(Number(hh))}:${z2(Number(mm))}` : "");
  };
  return <span className="ck-hora24" role="group" aria-label={rotulo}>
    <input type="text" inputMode="numeric" maxLength={2} placeholder={opcional ? "--" : "00"} value={h} aria-label={`${rotulo} - hora`} onChange={(e) => digitar(e.target.value, "h")} onBlur={() => sair("h")} />
    <span aria-hidden="true">:</span>
    <input type="text" inputMode="numeric" maxLength={2} placeholder={opcional ? "--" : "00"} value={m} aria-label={`${rotulo} - minuto`} onChange={(e) => digitar(e.target.value, "m")} onBlur={() => sair("m")} />
  </span>;
}

function repeticaoDaTask(task) {
  const r = task?.recurrence;
  if (!r) return "0";
  if (r.tipo === "semana") return "personalizado";
  if (r.tipo === "meses") return Number(r.intervalo) === 1 ? "30" : "personalizado";
  return [1, 3].includes(Number(r.intervalo)) ? String(r.intervalo) : "personalizado";
}
function configRepeticaoDaTask(task) { return task?.recurrence ? { ...task.recurrence, diasSemana: task.recurrence.diasSemana || [] } : { tipo: "dias", intervalo: 2, diasSemana: [] }; }
function recurrencePayload(opcao, config) {
  if (opcao === "personalizado") return config.tipo !== "semana" && Number(config.intervalo) <= 0 ? null : config;
  if (opcao === "30") return { tipo: "meses", intervalo: 1 };
  return Number(opcao) > 0 ? { tipo: "dias", intervalo: Number(opcao) } : null;
}
function recurrenceLabel(task) {
  const r = task.recurrence;
  if (!r) return "";
  if (r.tipo === "semana") return `↻ ${DIAS_SEMANA.filter(([n]) => (r.diasSemana || []).includes(n)).map(([, label]) => label.toLowerCase()).join(", ")}`;
  if (r.tipo === "meses") return r.intervalo === 1 ? "↻ uma vez por mês" : `↻ a cada ${r.intervalo} meses`;
  return Number(r.intervalo) === 1 ? "↻ todo dia" : Number(r.intervalo) === 3 ? "↻ a cada 3 dias" : `↻ a cada ${r.intervalo} dias`;
}

function SocialAlca({ item, onKeyboardMove, onPointerStart, label }) {
  return <span className="ck-alca ck-social-drag-handle" role="button" tabIndex={0} title="Arraste para organizar; no celular, toque e segure; use ↑ e ↓ pelo teclado" aria-label={`Reordenar ${label}`} onPointerDown={(e) => onPointerStart(e, item)} onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onKeyboardMove(item, e.key === "ArrowUp" ? -1 : 1); } }}>
    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" fill="currentColor">{[3, 8, 13].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}</svg>
  </span>;
}
function prioridadePeloPrazo(task, agora) {
  const base = Number(task.priority) || 0;
  if (!base || !task.due_date || task.completed) return base;
  const prazo = new Date(`${task.due_date}T${task.due_time?.slice(0, 5) || "23:59"}:00`).getTime();
  const criada = new Date(task.created_at || agora).getTime();
  const duracao = prazo - criada; const restante = prazo - agora;
  if (duracao <= 0) return base;
  if (restante <= duracao / 4) return Math.max(base, 3);
  if (restante <= duracao / 2) return Math.max(base, 2);
  return base;
}

const ERROS_SOCIAL = {
  user_not_found: "Não encontrei uma conta com esse nome de usuário ou email.",
  cannot_add_self: "Você não pode enviar um pedido para si mesmo.",
  already_friends: "Vocês já são amigos.",
  request_already_sent: "O pedido já foi enviado.",
  incoming_request_exists: "Essa pessoa já enviou um pedido. Confira os pedidos recebidos.",
  request_not_found: "Esse pedido já foi respondido ou não está mais disponível.",
};

const nomeVisivel = (nome = "") => {
  const caracteres = Array.from(nome);
  if (!caracteres.length) return nome;
  return caracteres[0].toLocaleUpperCase("pt-BR") + caracteres.slice(1).join("");
};

function mensagemErro(error, fallback) {
  const detalhe = error?.message || "";
  const codigo = Object.keys(ERROS_SOCIAL).find((item) => detalhe.includes(item));
  return codigo ? ERROS_SOCIAL[codigo] : fallback;
}

function IconePessoa() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.8 17c.4-3.1 2.8-5 6.2-5s5.8 1.9 6.2 5" /></svg>;
}

export function AnotacoesCompartilhadas({ tipo, escopoId }) {
  const colunaEscopo = tipo === "equipe" ? "team_id" : "friendship_id";
  const chaveEstadoVisual = `crysalis:anotacoes-compartilhadas:${tipo}:${escopoId}`;
  const [notes, setNotes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [noteForm, setNoteForm] = useState(null);
  const [groupForm, setGroupForm] = useState(null);
  const [fechadas, setFechadas] = useState(() => lerPreferenciaLocal(chaveEstadoVisual, {}));
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [draggingNote, setDraggingNote] = useState("");
  const [noteDropTarget, setNoteDropTarget] = useState(null);
  const noteDragRef = useRef(null);
  const reorderNoteRef = useRef(null);

  useEffect(() => { salvarPreferenciaLocal(chaveEstadoVisual, fechadas); }, [chaveEstadoVisual, fechadas]);

  const load = useCallback(async () => {
    const [notesResult, groupsResult] = await Promise.all([
      supabase.from("shared_notes").select("*").eq(colunaEscopo, escopoId).order("position").order("created_at"),
      supabase.from("shared_note_groups").select("*").eq(colunaEscopo, escopoId).order("position").order("created_at"),
    ]);
    if (notesResult.error || groupsResult.error) setError("Não consegui carregar as anotações. A migração de sessões compartilhadas precisa estar aplicada no Supabase.");
    else { setNotes(notesResult.data || []); setGroups(groupsResult.data || []); setError(""); }
  }, [colunaEscopo, escopoId]);

  useEffect(() => {
    load();
    const channel = supabase.channel(`shared-notes-${tipo}-${escopoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_notes", filter: `${colunaEscopo}=eq.${escopoId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_note_groups", filter: `${colunaEscopo}=eq.${escopoId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, tipo, escopoId, colunaEscopo]);

  useEffect(() => {
    function shortcuts(event) {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "f") { event.preventDefault(); setNoteForm((current) => current || { id: null, title: "", body: "", groupId: null }); }
      if (key === "d") { event.preventDefault(); setGroupForm((current) => current && !current.group ? null : { group: null }); }
    }
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);

  useEffect(() => {
    function targetAt(x, y, sourceId) {
      const element = document.elementFromPoint(x, y);
      const row = element?.closest("[data-shared-note-id]");
      if (row) {
        if (row.dataset.sharedNoteId === sourceId) return null;
        const rect = row.getBoundingClientRect();
        return { noteId: row.dataset.sharedNoteId, groupId: row.dataset.sharedNoteGroupId || null, after: y >= rect.top + rect.height / 2 };
      }
      const group = element?.closest("[data-shared-note-group]");
      return group ? { noteId: null, groupId: group.dataset.sharedNoteGroup || null, after: false } : null;
    }
    function move(event) {
      const drag = noteDragRef.current;
      if (!drag) return;
      if (!drag.active) {
        const distance = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
        if (drag.pointerType === "touch" && distance > 12) { clearTimeout(drag.timer); noteDragRef.current = null; return; }
        if (drag.pointerType !== "touch" && distance > 5) { drag.active = true; setDraggingNote(drag.id); }
        else return;
      }
      event.preventDefault();
      drag.target = targetAt(event.clientX, event.clientY, drag.id);
      setNoteDropTarget(drag.target);
    }
    function finish(event) {
      const drag = noteDragRef.current;
      if (!drag) return;
      clearTimeout(drag.timer);
      noteDragRef.current = null;
      if (drag.active) {
        const target = targetAt(event.clientX, event.clientY, drag.id);
        if (target) reorderNoteRef.current?.(drag.id, target.groupId, target.noteId, target.after);
      }
      setDraggingNote(""); setNoteDropTarget(null);
    }
    function cancel() { const drag = noteDragRef.current; if (drag) clearTimeout(drag.timer); noteDragRef.current = null; setDraggingNote(""); setNoteDropTarget(null); }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", finish); document.removeEventListener("pointercancel", cancel); };
  }, []);

  function startNoteDrag(event, note) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (noteDragRef.current) clearTimeout(noteDragRef.current.timer);
    const drag = { id: note.id, x: event.clientX, y: event.clientY, pointerType: event.pointerType, active: false, target: null, timer: null };
    if (event.pointerType === "touch") drag.timer = window.setTimeout(() => { drag.active = true; setDraggingNote(note.id); }, 320);
    noteDragRef.current = drag;
  }

  function beginNote(note = null, groupId = null) {
    const noteDate = note ? (note.note_date === undefined ? note.created_at?.slice(0, 10) || "" : note.note_date || "") : hojeISO();
    setNoteForm({ id: note?.id || null, title: note?.title || "", body: note?.body || "", date: noteDate, groupId: note?.group_id ?? groupId });
    setGroupForm(null);
  }

  async function saveNote(event) {
    event.preventDefault();
    if (!noteForm?.title.trim()) return;
    const changes = { title: noteForm.title.trim(), body: noteForm.body.trim(), note_date: noteForm.date || null, group_id: noteForm.groupId || null, updated_at: new Date().toISOString() };
    const result = noteForm.id
      ? await supabase.from("shared_notes").update(changes).eq("id", noteForm.id)
      : await supabase.from("shared_notes").insert({ ...changes, [colunaEscopo]: escopoId, position: notes.filter((n) => (n.group_id || null) === (noteForm.groupId || null)).length });
    if (result.error) setError("Não consegui salvar a anotação compartilhada.");
    else { setNoteForm(null); await load(); }
  }

  async function saveGroup(fields, group = groupForm?.group || null) {
    const result = group
      ? await supabase.from("shared_note_groups").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", group.id)
      : await supabase.from("shared_note_groups").insert({ ...fields, [colunaEscopo]: escopoId, position: groups.length });
    if (result.error) setError(group ? "Não consegui editar a sessão de anotações." : "Não consegui criar a sessão de anotações.");
    else { setGroupForm(null); await load(); }
  }

  async function deleteNote(note) {
    setDeleteConfirm({ title: "Excluir anotação?", message: `“${note.title}” será removida para todos os integrantes.`, action: "Excluir para todos", table: "shared_notes", id: note.id, errorMessage: "Não consegui excluir a anotação." });
  }

  async function deleteGroup(group) {
    setDeleteConfirm({ title: "Excluir sessão?", message: `“${group.name}” será removida. As anotações vão para Sem sessão.`, action: "Excluir sessão", table: "shared_note_groups", id: group.id, errorMessage: "Não consegui excluir a sessão." });
  }

  async function confirmDelete() {
    if (!deleteConfirm || deleteBusy) return;
    setDeleteBusy(true);
    const { error: deleteError } = await supabase.from(deleteConfirm.table).delete().eq("id", deleteConfirm.id);
    setDeleteBusy(false);
    setDeleteConfirm(null);
    if (deleteError) setError(deleteConfirm.errorMessage); else await load();
  }

  async function reorderNote(noteId, targetGroupId, targetId = null, after = false) {
    const dragged = notes.find((note) => note.id === noteId);
    if (!dragged) return;
    const targetGroup = targetGroupId || null;
    const affectedGroups = new Set([dragged.group_id || null, targetGroup]);
    let next = [...notes];
    for (const groupId of affectedGroups) {
      let list = next.filter((note) => (note.group_id || null) === groupId).sort((a, b) => a.position - b.position);
      if ((dragged.group_id || null) === groupId) list = list.filter((note) => note.id !== noteId);
      if (groupId === targetGroup) {
        const index = targetId ? list.findIndex((note) => note.id === targetId) : list.length;
        const insertAt = index < 0 ? list.length : index + (after ? 1 : 0);
        list.splice(insertAt, 0, { ...dragged, group_id: groupId });
      }
      list = list.map((note, position) => ({ ...note, group_id: groupId, position }));
      next = next.filter((note) => (note.group_id || null) !== groupId).concat(list);
    }
    setNotes(next.sort((a, b) => {
      const ga = groups.findIndex((group) => group.id === a.group_id); const gb = groups.findIndex((group) => group.id === b.group_id);
      return ga - gb || a.position - b.position;
    }));
    const updates = next.filter((note) => affectedGroups.has(note.group_id || null));
    const results = await Promise.all(updates.map((note) => supabase.from("shared_notes").update({ group_id: note.group_id, position: note.position }).eq("id", note.id)));
    if (results.some((result) => result.error)) { setError("Não consegui mudar a ordem das anotações."); await load(); }
  }
  reorderNoteRef.current = reorderNote;

  function moveNoteByKeyboard(note, delta) {
    const siblings = notesFor(note.group_id || null);
    const index = siblings.findIndex((item) => item.id === note.id);
    const target = siblings[index + delta];
    if (target) reorderNote(note.id, note.group_id || null, target.id, delta > 0);
  }

  function noteRow(note) {
    const descriptionOpen = !fechadas[note.id];
    if (noteForm?.id === note.id) return <article key={note.id} data-shared-note-id={note.id} data-shared-note-group-id={note.group_id || ""} className="ck-anotacao ck-team-note-edit-row"><NoteFormInline form={noteForm} setForm={setNoteForm} onSubmit={saveNote} onCancel={() => setNoteForm(null)} /></article>;
    return <article key={note.id} data-shared-note-id={note.id} data-shared-note-group-id={note.group_id || ""} className={`ck-anotacao ck-team-note-row${draggingNote === note.id ? " arrastando" : ""}${noteDropTarget?.noteId === note.id ? " alvo" : ""}`}>
      <span className="ck-alca ck-shared-note-handle" role="button" tabIndex={0} aria-label="Mover anotação; use as setas para cima e para baixo" title="Arraste para mudar a posição" onPointerDown={(event) => startNoteDrag(event, note)} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); moveNoteByKeyboard(note, event.key === "ArrowUp" ? -1 : 1); } }}><svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="3" cy="9" r="1.2"/><circle cx="9" cy="9" r="1.2"/><circle cx="3" cy="15" r="1.2"/><circle cx="9" cy="15" r="1.2"/></svg></span>
      <div className="ck-anotacao-corpo"><div><strong>{note.title}</strong>{(note.note_date === undefined ? note.created_at?.slice(0, 10) : note.note_date) && <time>{new Date(((note.note_date === undefined ? note.created_at?.slice(0, 10) : note.note_date) || "") + "T00:00").toLocaleDateString("pt-BR")}</time>}</div>{note.body && descriptionOpen && <p>{note.body}</p>}</div>
      {note.body && <button type="button" className="ck-descricao-toggle" aria-label={descriptionOpen ? "Ocultar anotação" : "Mostrar anotação"} aria-expanded={descriptionOpen} onClick={() => setFechadas((value) => ({ ...value, [note.id]: !value[note.id] }))}><svg className={`ck-descricao-seta${descriptionOpen ? " aberta" : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 6 4.5 4.5L12.5 6" /></svg></button>}
      <button type="button" className="ck-icone" title="Editar anotação" aria-label={`Editar ${note.title}`} onClick={() => beginNote(note)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button><button type="button" className="ck-icone ck-social-remove" title="Excluir anotação" aria-label={`Excluir ${note.title}`} onClick={() => deleteNote(note)}>×</button>
    </article>;
  }

  const notesFor = (groupId) => notes.filter((note) => (note.group_id || null) === (groupId || null)).sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));
  return <div className="ck-shared-notes">
    {error && <p className="ck-social-message erro" role="alert">{error}</p>}
    <div className="ck-barras-topo"><button type="button" className="ck-barra-mais" onClick={() => beginNote()}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar anotação</span><kbd className="ck-atalho">Ctrl F</kbd></button><button type="button" className="ck-barra-mais" onClick={() => { setGroupForm((value) => value && !value.group ? null : { group: null }); setNoteForm(null); }}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar sessão</span><kbd className="ck-atalho">Ctrl D</kbd></button></div>
    {noteForm && !noteForm.id && !noteForm.groupId && <NoteFormInline form={noteForm} setForm={setNoteForm} onSubmit={saveNote} onCancel={() => setNoteForm(null)} />}
    {groupForm && !groupForm.group && <GroupEditor onCancel={() => setGroupForm(null)} onSave={(fields) => saveGroup(fields, null)} />}
    {groups.map((group) => {
      const groupNotes = notesFor(group.id);
      const collapsed = Boolean(fechadas[`group:${group.id}`]);
      return <section data-shared-note-group={group.id} key={group.id} className={`ck-grupo ck-social-note-group${collapsed ? " recolhida" : ""}${noteDropTarget && !noteDropTarget.noteId && noteDropTarget.groupId === group.id ? " alvo" : ""}`} onDragOver={(event) => { if (draggingNote) event.preventDefault(); }} onDrop={(event) => { if (draggingNote) { event.preventDefault(); reorderNote(draggingNote, group.id); setDraggingNote(""); } }}>
        <header className="ck-grupo-topo"><button type="button" className="ck-grupo-titulo" aria-expanded={!collapsed} onClick={() => setFechadas((value) => ({ ...value, [`group:${group.id}`]: !value[`group:${group.id}`] }))}><span className={`ck-seta ${!collapsed ? "aberta" : ""}`}>›</span><IconeGrupo tipo={group.icon}/><span className="ck-grupo-nome">{group.name}</span><span className="ck-grupo-qtd">{groupNotes.length}</span></button>{groupForm?.group?.id !== group.id && <><button type="button" className="ck-mais ck-mais-circular" title="Adicionar anotação nesta sessão" aria-label={`Adicionar anotação em ${group.name}`} onClick={() => { setFechadas((value) => ({ ...value, ["group:" + group.id]: false })); beginNote(null, group.id); }}><IconeGrupoMais/></button><button type="button" className="ck-icone" title="Editar sessão" aria-label={`Editar sessão ${group.name}`} onClick={() => { setFechadas((value) => ({ ...value, ["group:" + group.id]: false })); setGroupForm({ group }); setNoteForm(null); }}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z"/></svg></button><button type="button" className="ck-icone ck-social-remove" title="Apagar sessão" aria-label={`Apagar sessão ${group.name}`} onClick={() => deleteGroup(group)}>×</button></>}</header>
        {!collapsed && <>{groupForm?.group?.id === group.id && <GroupEditor group={group} onCancel={() => setGroupForm(null)} onSave={(fields) => saveGroup(fields, group)}/ >}{noteForm && !noteForm.id && noteForm.groupId === group.id && <NoteFormInline form={noteForm} setForm={setNoteForm} onSubmit={saveNote} onCancel={() => setNoteForm(null)}/ >}{groupNotes.map(noteRow)}{!groupNotes.length && !groupForm?.group && !noteForm?.groupId && <p className="ck-vazio-grupo">Nenhuma anotação nesta sessão.</p>}</>}
      </section>;
    })}
    {<section data-shared-note-group="" className={"ck-grupo ck-social-note-unfiled" + (noteDropTarget && !noteDropTarget.noteId && noteDropTarget.groupId == null ? " alvo" : "")}><h2 className="ck-secao">Sem sessão</h2>{notesFor(null).map(noteRow)}</section>}
    {!groups.length && !notes.length && !noteForm && <p className="ck-vazio">Adicione uma anotação ou crie uma sessão.</p>}
    <ConfirmacaoSocial confirm={deleteConfirm} busy={deleteBusy} onCancel={() => setDeleteConfirm(null)} onConfirm={confirmDelete} />
  </div>;
}

function NoteFormInline({ form, setForm, onSubmit, onCancel }) {
  const formRef = useRef(null);
  useEffect(() => {
    function closeOutside(event) { const owner = formRef.current?.closest("article") || formRef.current; if (owner && !owner.contains(event.target)) onCancel(); }
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [onCancel]);
  return <form ref={formRef} className="ck-form-grupo ck-form-anotacao ck-shared-note-editor" onSubmit={onSubmit} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); else if (event.key === "Enter" && event.target.tagName === "TEXTAREA" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.requestSubmit(); } }}><div className="ck-anotacao-titulo-data"><input autoFocus maxLength={100} required value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="Título" aria-label="Título da anotação"/><DataDiaMes value={form.date || ""} onChange={(date) => setForm((value) => ({ ...value, date }))} rotulo="Data da anotação (opcional): dia e mês" /></div><textarea className="ck-campo-largo" rows={4} maxLength={5000} value={form.body} onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))} placeholder="Anotação (opcional)" aria-label="Anotação (opcional)"/><div className="ck-edit-acoes"><button type="submit" disabled={!form.title.trim()}>{form.id ? "Salvar" : "Adicionar"}</button><button type="button" className="ck-icone" onClick={onCancel} aria-label="Cancelar">×</button></div></form>;
}

function IconeGrupoMais() {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>;
}

function TaskEditor({ initial, groupId = null, onSave, onCancel, busy }) {
  const formRef = useRef(null);
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [comment, setComment] = useState(initial?.comment || "");
  const [dueDate, setDueDate] = useState(initial?.due_date || "");
  const [dueTime, setDueTime] = useState(initial?.due_time?.slice(0, 5) || "");
  const [repeatTime, setRepeatTime] = useState(initial?.recurrence_time?.slice(0, 5) || "00:00");
  const [repeat, setRepeat] = useState(repeticaoDaTask(initial));
  const [repeatConfig, setRepeatConfig] = useState(configRepeticaoDaTask(initial));
  const [commentOpen, setCommentOpen] = useState(Boolean(initial?.comment));
  const repeatData = recurrencePayload(repeat, repeatConfig);

  useEffect(() => {
    function closeOutside(event) {
      const owner = formRef.current?.closest("li.ck-social-task-card.editando") || formRef.current;
      if (owner && !owner.contains(event.target)) onCancel();
    }
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [onCancel]);

  async function submit(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (repeatData?.tipo === "semana" && !repeatData.diasSemana?.length) return;
    const prazoResolvido = dueDate || (dueTime ? hojeISO() : null);
    await onSave({
      title: cleanTitle, description: description.trim(), comment: comment.trim(),
      due_date: prazoResolvido, due_time: prazoResolvido ? (dueTime || null) : null,
      recurrence: repeatData, recurrence_time: repeatData ? (repeatTime || "00:00") : null,
      scheduled_for: initial?.scheduled_for || hojeISO(), group_id: initial?.group_id || groupId,
    });
  }

  return <form ref={formRef} className="ck-form-grupo ck-editor-tarefa ck-social-task-form" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); else if (event.key === "Enter" && event.target.tagName === "TEXTAREA" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
    <input autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que vocês precisam fazer?" aria-label="Nome da tarefa compartilhada" required onKeyDown={(e) => e.key === "Escape" && onCancel()} />
    <div className="ck-social-repeat-row">
      <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Frequência da tarefa">
        {OPCOES_REPETE.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      {repeat !== "0" && <Hora24Social value={repeatTime} onChange={setRepeatTime} rotulo="Horário da repetição" />}
    </div>
    {repeat === "personalizado" && <div className="ck-repeticao-personalizada ck-social-repeat-custom">
      <label className="ck-repeticao-tipo">Repetir por
        <select value={repeatConfig.tipo} onChange={(e) => setRepeatConfig((v) => ({ ...v, tipo: e.target.value }))}>
          <option value="dias">A cada N dias</option><option value="semana">Dias da semana</option><option value="meses">A cada N meses</option>
        </select>
      </label>
      {repeatConfig.tipo === "semana" ? <div className="ck-dias-semana" aria-label="Dias da semana">{DIAS_SEMANA.map(([n, label]) => <label key={n} className={(repeatConfig.diasSemana || []).includes(n) ? "selecionado" : ""}><input type="checkbox" checked={(repeatConfig.diasSemana || []).includes(n)} onChange={(e) => setRepeatConfig((v) => ({ ...v, diasSemana: e.target.checked ? [...new Set([...(v.diasSemana || []), n])].sort((a, b) => DIAS_SEMANA.findIndex(([d]) => d === a) - DIAS_SEMANA.findIndex(([d]) => d === b)) : (v.diasSemana || []).filter((d) => d !== n) }))} />{label}</label>)}</div>
        : <label className="ck-repeticao-intervalo">A cada <input type="number" min="0" max={repeatConfig.tipo === "meses" ? 24 : 365} value={repeatConfig.intervalo ?? ""} aria-label="Intervalo (vazio ou zero significa não repetir)" title="Deixe vazio ou use 0 para não repetir" onChange={(e) => setRepeatConfig((v) => ({ ...v, intervalo: e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0) }))} />{repeatConfig.tipo === "meses" ? "meses" : "dias"}</label>}
    </div>}
    <div className="ck-prazo-campos"><span className="ck-prazo-rotulo">Prazo</span><DataDiaMes value={dueDate} onChange={setDueDate} /><Hora24Social value={dueTime} onChange={setDueTime} rotulo="Horário do prazo (opcional)" opcional /></div>
    <textarea className="ck-campo-largo" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" aria-label="Descrição da tarefa compartilhada" />
    <div className="ck-tarefa-form-rodape">
      <div className="ck-tarefa-form-botoes"><span className="ck-edit-acoes"><button type="submit" disabled={busy || !title.trim() || (repeatData?.tipo === "semana" && !repeatData.diasSemana?.length)}>{busy ? "Salvando…" : initial ? "Salvar" : "Adicionar"}</button><button type="button" className="ck-icone" onClick={onCancel} title="Cancelar (Esc)" aria-label="Cancelar">×</button></span></div>
      {commentOpen && <textarea className="ck-comentario-input" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentário (opcional)" aria-label="Comentário da tarefa" />}
      <button type="button" className="ck-comentario-botao" aria-label={commentOpen ? "Ocultar campo de comentário" : "Adicionar comentário"} aria-expanded={commentOpen} title="Comentário" onClick={() => setCommentOpen((v) => !v)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 7.7a5.6 5.6 0 0 1-5.8 5.1 6.2 6.2 0 0 1-2.5-.5L2 13l.8-2.7a5 5 0 0 1-.8-2.6A5.5 5.5 0 0 1 7.8 2.5h.4a5.5 5.5 0 0 1 5.3 5.2z" /></svg></button>
    </div>
  </form>;
}

function TarefaCompartilhada({ task, onToggle, onEdit, onDelete, busy, now, source, dragging, dropTarget, onKeyboardMove, onPointerStart }) {
  const [editing, setEditing] = useState(false);
  const chaveDescricao = `crysalis:descricao-tarefa-compartilhada:${task.id}`;
  const [descriptionOpen, setDescriptionOpen] = useState(() => lerPreferenciaLocal(chaveDescricao, false));
  const [priority, setPriority] = useState(task.priority || 0);
  const checkboxRef = useRef(null);
  useEffect(() => setPriority(task.priority || 0), [task.priority]);
  useEffect(() => { salvarPreferenciaLocal(chaveDescricao, descriptionOpen); }, [chaveDescricao, descriptionOpen]);
  useEffect(() => { if (checkboxRef.current) checkboxRef.current.indeterminate = Boolean(task.partial && !task.completed); }, [task.partial, task.completed]);
  const visiblePriority = prioridadePeloPrazo({ ...task, priority }, now);
  const dueText = task.due_date ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + (task.due_time ? ` ${task.due_time.slice(0, 5)}` : "") : "";
  const isDragging = dragging?.type === "task" && dragging.id === task.id;
  const isTarget = dropTarget?.type === "task" && dropTarget.id === task.id;
  const sameListTarget = dragging?.type === "task" && dragging.friendshipId === task.friendship_id && (dragging.groupId || null) === (task.group_id || null);
  const placementClass = isTarget && !sameListTarget ? ` insercao-${dropTarget.placement || "before"}` : "";
  return <li data-social-drop-kind="task" data-social-id={task.id} data-social-friendship-id={task.friendship_id} data-social-group-id={task.group_id || ""} className={`ck-social-task-card${task.completed ? " feita" : ""}${editing ? " editando" : ""}${isDragging ? " arrastando" : ""}${isTarget ? " alvo" : ""}${placementClass}`}>
    {editing ? <TaskEditor initial={task} busy={busy} onCancel={() => setEditing(false)} onSave={async (fields) => { if (await onEdit(task.id, fields)) setEditing(false); }} /> : <>
      <SocialAlca item={source} onKeyboardMove={onKeyboardMove} onPointerStart={onPointerStart} label={task.title} />
      <label className="ck-social-task-label"><input ref={checkboxRef} type="checkbox" checked={task.completed} onChange={() => onToggle(task)} aria-label={`Status: ${task.completed ? "pronta" : task.partial ? "meio pronta" : "pendente"}. Clique para avançar o status.`} /><span className="ck-caixa" aria-hidden="true" /><span className="ck-corpo"><span className="ck-texto">{task.title}</span>
        {(task.recurrence || dueText || task.comment) && <span className="ck-meta">{task.recurrence && <span className="ck-repete">{recurrenceLabel(task)}{task.recurrence_time && task.recurrence_time.slice(0, 5) !== "00:00" ? ` às ${task.recurrence_time.slice(0, 5)}` : ""}</span>}{dueText && <span className="ck-prazo">⏰ até {dueText}</span>}{task.comment && <span className="ck-tarefa-comentario"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 7.7a5.6 5.6 0 0 1-5.8 5.1 6.2 6.2 0 0 1-2.5-.5L2 13l.8-2.7a5 5 0 0 1-.8-2.6A5.5 5.5 0 0 1 7.8 2.5h.4a5.5 5.5 0 0 1 5.3 5.2z" /></svg><span>{task.comment}</span></span>}</span>}
        {task.description && descriptionOpen && <span className="ck-descricao">{task.description}</span>}
      </span></label>
      {task.description && <button type="button" className="ck-descricao-toggle" aria-label={descriptionOpen ? "Ocultar descrição" : "Mostrar descrição"} aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen((v) => !v)}><svg className={`ck-descricao-seta${descriptionOpen ? " aberta" : ""}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 6 4.5 4.5L12.5 6" /></svg></button>}
      <button type="button" className={`ck-prio p${visiblePriority}`} onClick={() => { const n = (priority + 1) % 4; setPriority(n); onEdit(task.id, { priority: n }); }} title={`${visiblePriority !== priority ? "Aumentada pelo prazo · " : ""}Clique para trocar a prioridade`} aria-label={`Prioridade ${visiblePriority}, clique para trocar`} />
      <button type="button" className="ck-icone" onClick={() => setEditing(true)} aria-label={`Editar ${task.title}`} title="Editar"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button>
      <button type="button" className="ck-icone ck-social-remove" onClick={() => onDelete(task)} aria-label={`Apagar ${task.title}`} title="Apagar">×</button>
    </>}
  </li>;
}

function ConfirmacaoSocial({ confirm, busy, onCancel, onConfirm }) {
  if (!confirm) return null;
  return <div className="ck-social-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
    <section className="ck-social-modal" role="alertdialog" aria-modal="true" aria-labelledby="ck-social-confirm-title">
      <h2 id="ck-social-confirm-title">{confirm.title}</h2><p>{confirm.message}</p>
      <div><button type="button" className="ck-social-danger" disabled={busy} onClick={onConfirm}>{busy ? "Aguarde…" : confirm.action}</button><button type="button" className="secundario" disabled={busy} onClick={onCancel}>Cancelar</button></div>
    </section>
  </div>;
}

export const ICONES_GRUPO = [["butterfly", "Borboleta"], ["home", "Casa"], ["person", "Pessoa"], ["work", "Trabalho"], ["book", "Estudos"], ["heart", "Favoritos"], ["star", "Importante"], ["calendar", "Agenda"], ["target", "Objetivo"], ["folder", "Geral"]];
export function IconeGrupo({ tipo = "folder" }) {
  if (tipo === "butterfly") return <span className="ck-sessao-icone logo monocromatico" style={{ maskImage: `url("${import.meta.env.BASE_URL}Logo.svg")`, WebkitMaskImage: `url("${import.meta.env.BASE_URL}Logo.svg")` }} aria-hidden="true" />;
  const paths = {
    home: <><path d="m2.5 8 6.5-5.5L15.5 8v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14z" /><path d="M7 15.5v-5h4v5" /></>,
    person: <><circle cx="9" cy="5.5" r="3" /><path d="M3 16c.3-3 2.3-4.7 6-4.7s5.7 1.7 6 4.7" /></>,
    work: <><rect x="2.5" y="5.5" width="13" height="9.5" rx="1.5" /><path d="M6 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 12 4v1.5M2.5 9h13" /></>,
    book: <><path d="M2.5 3.5h4A2.5 2.5 0 0 1 9 6v9a2.5 2.5 0 0 0-2.5-2.5h-4z" /><path d="M15.5 3.5h-4A2.5 2.5 0 0 0 9 6v9a2.5 2.5 0 0 1 2.5-2.5h4z" /></>,
    heart: <path d="M9 15.5 3 9.8a3.7 3.7 0 0 1 5.2-5.2L9 5.4l.8-.8A3.7 3.7 0 0 1 15 9.8z" />,
    star: <path d="m9 2.3 2 4.1 4.5.7-3.2 3.2.8 4.5L9 12.7l-4.1 2.1.8-4.5L2.5 7.1 7 6.4z" />,
    calendar: <><rect x="2.5" y="4" width="13" height="11.5" rx="1.5" /><path d="M5.5 2.5v3M12.5 2.5v3M2.5 7.5h13" /></>,
    target: <><circle cx="9" cy="9" r="6.5" /><circle cx="9" cy="9" r="3.5" /></>,
    folder: <path d="M2.5 5A1.5 1.5 0 0 1 4 3.5h3l1.5 2h5.5A1.5 1.5 0 0 1 15.5 7v6A1.5 1.5 0 0 1 14 14.5H4A1.5 1.5 0 0 1 2.5 13z" />,
  };
  return <svg className="ck-sessao-icone" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[tipo] || paths.folder}</svg>;
}

export function GroupEditor({ group, onSave, onCancel }) {
  const formRef = useRef(null);
  const [name, setName] = useState(group?.name || "");
  const [icon, setIcon] = useState(group?.icon || "butterfly");
  useEffect(() => {
    const closeOutside = (event) => {
      if (formRef.current && !formRef.current.contains(event.target)) window.setTimeout(() => onCancel?.(), 0);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [onCancel]);
  return <form ref={formRef} className="ck-editar-sessao ck-social-group-editor" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), icon }); }} onKeyDown={(event) => { if (event.key === "Escape") onCancel?.(); }}>
    <div className="ck-seletor-icones">{ICONES_GRUPO.map(([item, label]) => <button type="button" className="ck-opcao-icone" key={item} aria-pressed={icon === item} aria-label={`Ícone ${label}`} title={label} onClick={() => setIcon(item)}><IconeGrupo tipo={item} /></button>)}</div>
    <input autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da sessão" aria-label="Nome da sessão compartilhada" required />
    <button type="submit" className="ck-icone" aria-label="Salvar sessão" title="Salvar sessão"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3.2 3.2L13 4.5" /></svg></button>
    <button type="button" className="ck-icone" onClick={onCancel} aria-label="Cancelar" title="Cancelar">×</button>
  </form>;
}

export default function Social({ user, view = "tasks", friendshipId = "", onBack, onOpenFriend, onManage, onMovePersonalTask, excluirSemConfirmacao = true }) {
  const [socialSection, setSocialSection] = useState("tasks");
  const [friends, setFriends] = useState([]);
  const [friendOrder, setFriendOrder] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskGroups, setTaskGroups] = useState([]);
  const [friendViews, setFriendViews] = useState({});
  function alternarVisaoAmigo(friendshipId) {
    const encontrarCard = () => [...document.querySelectorAll(".ck-social-friend-group")].find((el) => el.dataset.socialId === friendshipId);
    const topBefore = encontrarCard()?.getBoundingClientRect().top;
    const nextNotes = friendViews[friendshipId] !== "notes";
    setFriendViews((v) => ({ ...v, [friendshipId]: nextNotes ? "notes" : "tasks" }));
    setAddingFor("");
    setGroupForm(null);
    if (topBefore != null) requestAnimationFrame(() => requestAnimationFrame(() => {
      const topAfter = encontrarCard()?.getBoundingClientRect().top;
      if (topAfter != null) window.scrollBy(0, topAfter - topBefore);
    }));
  }
  const [query, setQuery] = useState("");
  const [foundUser, setFoundUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [taskError, setTaskError] = useState("");
  const [addingFor, setAddingFor] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const chaveSessoesAmigos = `crysalis:sessoes-amigos:${user.id}`;
  const [collapsedGroups, setCollapsedGroups] = useState(() => lerPreferenciaLocal(chaveSessoesAmigos, {}));
  const [groupForm, setGroupForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [sharePrompt, setSharePrompt] = useState(null);
  const touchDrag = useRef(null);
  const dropCallback = useRef(null);
  const sharePromptCallback = useRef(null);
  const taskRevision = useRef(0);
  const taskReadSequence = useRef(0);
  const taskOrderPending = useRef(0);
  useEffect(() => { salvarPreferenciaLocal(chaveSessoesAmigos, collapsedGroups); }, [chaveSessoesAmigos, collapsedGroups]);
  const taskOrderQueue = useRef(Promise.resolve());
  const taskReloadTimer = useRef(null);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(id); }, []);

  const loadTasks = useCallback(async () => {
    const request = ++taskReadSequence.current;
    const revision = taskRevision.current;
    const [taskResult, groupResult] = await Promise.all([
      supabase.from("social_tasks").select("*").order("position").order("created_at"),
      supabase.from("social_task_groups").select("*").order("position").order("created_at"),
    ]);
    if (taskResult.error) throw taskResult.error;
    if (groupResult.error && !String(groupResult.error.message || "").includes("social_task_groups")) throw groupResult.error;
    if (request !== taskReadSequence.current || revision !== taskRevision.current || taskOrderPending.current > 0) return;
    setTasks(taskResult.data || []);
    setTaskGroups(groupResult.data || []);
  }, []);

  const reloadTasksSoon = useCallback(() => {
    window.clearTimeout(taskReloadTimer.current);
    taskReloadTimer.current = window.setTimeout(() => { loadTasks().catch(() => {}); }, 100);
  }, [loadTasks]);

  const refresh = useCallback(async () => {
    const taskRequest = ++taskReadSequence.current;
    const taskRevisionAtStart = taskRevision.current;
    setError("");
    const [friendsResult, requestsResult, tasksResult, groupsResult, orderResult] = await Promise.all([
      supabase.rpc("social_list_friends"),
      supabase.rpc("social_list_requests"),
      supabase.from("social_tasks").select("*").order("position").order("created_at"),
      supabase.from("social_task_groups").select("*").order("position").order("created_at"),
      supabase.from("social_friend_order").select("friendship_id, position").order("position"),
    ]);
    const failure = friendsResult.error || requestsResult.error || tasksResult.error || groupsResult.error;
    if (failure) {
      setError("Não consegui carregar a área Social. Confira se a migração do Supabase foi aplicada e tente novamente.");
      setLoading(false);
      return;
    }
    setFriends(friendsResult.data || []);
    setFriendOrder(orderResult.error ? [] : orderResult.data || []);
    setRequests(requestsResult.data || []);
    if (taskRequest === taskReadSequence.current && taskRevisionAtStart === taskRevision.current && taskOrderPending.current === 0) {
      setTasks(tasksResult.data || []);
      setTaskGroups(groupsResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    refresh();
    const channel = supabase.channel("social-tasks-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_tasks" }, () => { if (active) reloadTasksSoon(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "social_task_groups" }, () => { if (active) reloadTasksSoon(); })
      .subscribe();
    const timer = window.setInterval(() => { if (active) refresh(); }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearTimeout(taskReloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user.id, refresh, reloadTasksSoon]);

  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setNotice("");
    setError("");
    setFoundUser(null);
    const { data, error: searchError } = await supabase.rpc("social_search_user", { p_query: query.trim().replace(/\s+/g, " ") });
    if (searchError) {
      setError(mensagemErro(searchError, "Não consegui fazer a busca agora."));
    } else if (!data?.length) {
      setNotice("Não encontrei uma conta com esse nome de usuário ou email.");
    } else {
      setFoundUser(data[0]);
    }
    setSearching(false);
  }

  async function sendRequest() {
    if (!foundUser) return;
    setBusyId(foundUser.user_id);
    setNotice("");
    const { error: sendError } = await supabase.rpc("social_send_request", { p_recipient: foundUser.user_id });
    if (sendError) {
      setError(mensagemErro(sendError, "Não consegui enviar o pedido."));
    } else {
      setNotice("Pedido enviado para " + nomeVisivel(foundUser.display_name) + ".");
      setFoundUser(null);
      setQuery("");
      await refresh();
    }
    setBusyId("");
  }

  async function respond(request, accept) {
    setBusyId(request.request_id);
    setError("");
    const { error: responseError } = await supabase.rpc("social_respond_request", { p_request_id: request.request_id, p_accept: accept });
    if (responseError) setError(mensagemErro(responseError, "Não consegui responder a esse pedido."));
    else {
      setNotice(accept ? "Agora você e " + nomeVisivel(request.display_name) + " são amigos." : "Pedido recusado.");
      await refresh();
    }
    setBusyId("");
  }

  async function saveTask(friendship, fields) {
    setSavingTask(true);
    setTaskError("");
    const result = await supabase.from("social_tasks").insert({
      ...fields,
      friendship_id: friendship.friendship_id,
      created_by: user.id,
      position: tasks.filter((item) => item.friendship_id === friendship.friendship_id).length,
    });
    if (result.error) {
      setTaskError("Não consegui salvar essa tarefa compartilhada. Tente novamente.");
      setSavingTask(false);
      return false;
    }
    scheduleCollaborationNotificationDispatch();
    setAddingFor("");
    await loadTasks().catch(() => setTaskError("A tarefa foi salva, mas não consegui atualizar a lista."));
    setSavingTask(false);
    return true;
  }

  async function toggleTask(task) {
    const next = task.completed ? { completed: false, partial: false } : task.partial ? { completed: true, partial: false } : { completed: false, partial: true };
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...next } : item));
    const { error: updateError } = await supabase.from("social_tasks").update({ ...next, updated_at: new Date().toISOString() }).eq("id", task.id);
    if (updateError) {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: task.completed, partial: Boolean(task.partial) } : item));
      setTaskError("Não consegui atualizar essa tarefa. Tente novamente.");
    }
    else { scheduleCollaborationNotificationDispatch(); await loadTasks().catch(() => {}); }
  }

  async function editTask(taskId, fields) {
    const { error: updateError } = await supabase.from("social_tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", taskId);
    if (updateError) {
      setTaskError("Não consegui editar essa tarefa. Tente novamente.");
      return false;
    }
    scheduleCollaborationNotificationDispatch();
    await loadTasks().catch(() => {});
    return true;
  }

  async function deleteTask(task) {
    const { error: deleteError } = await supabase.from("social_tasks").delete().eq("id", task.id);
    if (deleteError) setTaskError("Não consegui apagar essa tarefa. Tente novamente.");
    else { scheduleCollaborationNotificationDispatch(); await loadTasks().catch(() => {}); }
  }

  function confirmarExclusaoTarefaAmigo(friend, task) {
    if (excluirSemConfirmacao) {
      void deleteTask(task);
      return;
    }
    setConfirm({ type: "task", item: task, title: "Excluir tarefa compartilhada?", message: `“${task.title}” será removida para você e ${nomeVisivel(friend.display_name)}. Essa ação não pode ser desfeita.`, action: "Excluir para ambos" });
  }

  async function removerAmizade(friend) {
    const { error: removeError } = await supabase.rpc("social_remove_friend", { p_friendship_id: friend.friendship_id });
    if (removeError) setError("Não consegui remover essa amizade. Confira se a migração de sessões compartilhadas foi aplicada.");
    else { setNotice(`Amizade com ${nomeVisivel(friend.display_name)} removida. As tarefas compartilhadas também foram apagadas.`); await refresh(); }
  }

  async function salvarGrupo(friendshipId, values, group = null) {
    const query = group
      ? supabase.from("social_task_groups").update({ name: values.name, icon: values.icon, updated_at: new Date().toISOString() }).eq("id", group.id)
      : supabase.from("social_task_groups").insert({ friendship_id: friendshipId, created_by: user.id, name: values.name, icon: values.icon, position: taskGroups.filter((g) => g.friendship_id === friendshipId).length });
    const { error: groupError } = await query;
    if (groupError) { setTaskError("Não consegui salvar essa sessão compartilhada. Confira se a migração foi aplicada."); return false; }
    setGroupForm(null);
    await loadTasks().catch(() => {});
    return true;
  }

  async function apagarGrupo(group) {
    const { error: groupError } = await supabase.from("social_task_groups").delete().eq("id", group.id);
    if (groupError) setTaskError("Não consegui apagar essa sessão. Tente novamente.");
    else await loadTasks().catch(() => {});
  }

  async function confirmarAcao() {
    if (!confirm) return;
    setBusyId("confirm");
    if (confirm.type === "task") await deleteTask(confirm.item);
    if (confirm.type === "friend") await removerAmizade(confirm.item);
    if (confirm.type === "group") await apagarGrupo(confirm.item);
    setBusyId("");
    setConfirm(null);
  }

  function friendsOrdered() {
    const order = new Map(friendOrder.map((item) => [item.friendship_id, item.position]));
    return [...friends].sort((a, b) => (order.get(a.friendship_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.friendship_id) ?? Number.MAX_SAFE_INTEGER) || nomeVisivel(a.display_name).localeCompare(nomeVisivel(b.display_name), "pt-BR"));
  }

  function fimArraste() { setDragging(null); setDropTarget(null); }
  function podeSoltar(source, target) {
    if (!source || !target || source.id === target.id && source.type === target.type) return false;
    if (source.type === "personalTask") return ["friend", "group", "task", "unfiled"].includes(target.type);
    if (source.type === "friend") return target.type === "friend";
    if (source.type === "group") return target.type === "group" && source.friendshipId === target.friendshipId;
    if (source.type === "task" && target.type === "group" && source.groupId === target.id) return false;
    return source.type === "task" && ["task", "group", "unfiled"].includes(target.type) && source.friendshipId === target.friendshipId;
  }

  async function persistPositions(table, updates, friendshipId) {
    const results = await Promise.all(updates.map((item) => {
      let query = supabase.from(table).update(item.values).eq("id", item.id);
      if (friendshipId) query = query.eq("friendship_id", friendshipId);
      return query;
    }));
    const failure = results.find((result) => result.error)?.error;
    if (failure) {
      setTaskError("A ordem mudou na tela, mas não consegui sincronizá-la. Confira se a migração do Social foi aplicada.");
      await loadTasks().catch(() => {});
    }
  }

  async function persistTaskOrder(friendshipId, updates) {
    if (!updates.length) return;
    taskOrderPending.current += 1;
    const run = () => supabase.rpc("social_apply_task_order", {
      p_friendship_id: friendshipId,
      p_updates: updates.map(({ id, values }) => ({ id, group_id: values.group_id ?? null, position: values.position })),
    });
    const operation = taskOrderQueue.current.then(run, run);
    taskOrderQueue.current = operation.catch(() => {});
    let failed = false;
    try {
      const { error: saveError } = await operation;
      if (saveError) {
        failed = true;
        setTaskError("Não consegui salvar a nova ordem das tarefas. Aplique a migração mais recente do Social e tente novamente.");
      }
    } catch {
      failed = true;
      setTaskError("Não consegui salvar a nova ordem das tarefas. Tente novamente.");
    } finally {
      taskOrderPending.current = Math.max(0, taskOrderPending.current - 1);
      if (taskOrderPending.current === 0) {
        taskRevision.current += 1;
        await loadTasks().catch(() => {});
      }
    }
    if (failed) await loadTasks().catch(() => {});
  }

  async function soltarItem(event, target, forcedSource = null) {
    event.preventDefault();
    event.stopPropagation();
    const source = forcedSource || dragging;
    fimArraste();
    if (!podeSoltar(source, target)) return;

    if (source.type === "friend") {
      const ordered = friendsOrdered();
      const from = ordered.findIndex((item) => item.friendship_id === source.id);
      const to = ordered.findIndex((item) => item.friendship_id === target.id);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...ordered]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
      const rows = next.map((friend, position) => ({ user_id: user.id, friendship_id: friend.friendship_id, position, updated_at: new Date().toISOString() }));
      setFriendOrder(rows);
      const { error: saveError } = await supabase.from("social_friend_order").upsert(rows, { onConflict: "user_id,friendship_id" });
      if (saveError) { setTaskError("Não consegui salvar a ordem das pessoas. Aplique a nova migração do Social e tente novamente."); setFriendOrder([]); }
      return;
    }

    if (source.type === "group") {
      const siblings = taskGroups.filter((group) => group.friendship_id === source.friendshipId).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
      const from = siblings.findIndex((item) => item.id === source.id); const to = siblings.findIndex((item) => item.id === target.id);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...siblings]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
      setTaskGroups((current) => [...current.filter((group) => group.friendship_id !== source.friendshipId), ...next.map((group, position) => ({ ...group, position }))]);
      await persistPositions("social_task_groups", next.map((group, position) => ({ id: group.id, values: { position, updated_at: new Date().toISOString() } })), source.friendshipId);
      return;
    }

    if (source.type === "task") {
      const task = tasks.find((item) => item.id === source.id);
      if (!task) return;
      const targetGroup = target.type === "unfiled" ? null : target.type === "group" ? target.id : target.groupId;
      const originGroup = task.group_id || null;
      const siblings = (groupId) => tasks.filter((item) => item.friendship_id === source.friendshipId && (item.group_id || null) === groupId).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
      const origin = siblings(originGroup);
      if (originGroup === targetGroup) {
        if (target.type === "group") return;
        const from = origin.findIndex((item) => item.id === source.id);
        if (from < 0) return;
        const next = [...origin]; const [item] = next.splice(from, 1);
        if (target.type === "task") {
          // Igual à checklist: qualquer parte do cartão representa a posição da tarefa alvo.
          // Usamos o índice original do alvo para que mover para cima/baixo troque de lugar.
          const to = origin.findIndex((entry) => entry.id === target.id);
          if (to < 0) return;
          next.splice(to, 0, item);
        } else next.push(item);
        const updates = next.map((entry, position) => ({ id: entry.id, values: { group_id: originGroup, position, updated_at: new Date().toISOString() } }));
        taskRevision.current += 1;
        setTasks((current) => current.map((entry) => { const changed = updates.find((x) => x.id === entry.id); return changed ? { ...entry, position: changed.values.position } : entry; }));
        await persistTaskOrder(source.friendshipId, updates);
        return;
      }
      const from = origin.findIndex((item) => item.id === source.id);
      if (from < 0) return;
      const originNext = origin.filter((item) => item.id !== source.id);
      const destination = siblings(targetGroup).filter((item) => item.id !== source.id);
      const targetIndex = target.type === "task" ? destination.findIndex((item) => item.id === target.id) : -1;
      const insertion = targetIndex >= 0 ? targetIndex + (target.placement === "after" ? 1 : 0) : destination.length;
      destination.splice(insertion, 0, { ...task, group_id: targetGroup });
      const updates = [
        ...originNext.map((entry, position) => ({ id: entry.id, values: { position, group_id: originGroup, updated_at: new Date().toISOString() } })),
        ...destination.map((entry, position) => ({ id: entry.id, values: { position, group_id: targetGroup, updated_at: new Date().toISOString() } })),
      ];
      taskRevision.current += 1;
      setTasks((current) => current.map((entry) => { const changed = updates.find((x) => x.id === entry.id); return changed ? { ...entry, ...changed.values } : entry; }));
      await persistTaskOrder(source.friendshipId, updates);
    }
  }

  dropCallback.current = soltarItem;
  useEffect(() => {
    function targetAt(x, y, source) {
      let element = document.elementFromPoint(x, y)?.closest("[data-social-drop-kind]");
      while (element) {
        const data = element.dataset;
        if (source?.type === "task" && data.socialDropKind === "task" && data.socialId === source.id) return null;
        const target = {
          type: data.socialDropKind,
          id: data.socialId || undefined,
          friendshipId: data.socialFriendshipId || undefined,
          groupId: data.socialGroupId || null,
        };
        if (target.type === "task") {
          const rect = element.getBoundingClientRect();
          target.placement = y < rect.top + rect.height / 2 ? "before" : "after";
        }
        if (podeSoltar(source, target)) return target;
        element = element.parentElement?.closest("[data-social-drop-kind]") || null;
      }
      return null;
    }
    function move(event) {
      const gesture = touchDrag.current;
      if (!gesture) return;
      if (!gesture.active) {
        const distance = Math.abs(event.clientX - gesture.x) + Math.abs(event.clientY - gesture.y);
        if (gesture.pointerType === "touch" && distance > 12) {
          window.clearTimeout(gesture.timer);
          touchDrag.current = null;
          return;
        }
        if (gesture.pointerType !== "touch" && distance > 5) {
          gesture.active = true;
          setDragging(gesture.source);
        } else return;
      }
      event.preventDefault();
      const target = targetAt(event.clientX, event.clientY, gesture.source);
      gesture.target = target;
      setDropTarget(target);
    }
    function finish(event) {
      const gesture = touchDrag.current;
      if (!gesture) return;
      window.clearTimeout(gesture.timer);
      touchDrag.current = null;
      if (!gesture.active) return;
      const target = targetAt(event.clientX, event.clientY, gesture.source);
      if (target && gesture.source.type === "personalTask") sharePromptCallback.current?.(gesture.source.task, target);
      else if (target) dropCallback.current?.({ preventDefault() {}, stopPropagation() {} }, target, gesture.source);
      else { setDragging(null); setDropTarget(null); }
    }
    function beginPersonalDrag(event) {
      const { task, x, y } = event.detail || {};
      if (!task?.id) return;
      const source = { type: "personalTask", id: task.id, task };
      touchDrag.current = { source, x, y, pointerType: "touch", active: true, target: null, timer: null };
      setDragging(source);
    }
    function cancel() { if (touchDrag.current) window.clearTimeout(touchDrag.current.timer); touchDrag.current = null; setDragging(null); setDropTarget(null); }
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    window.addEventListener("crysalis:share-task-drag-start", beginPersonalDrag);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      window.removeEventListener("crysalis:share-task-drag-start", beginPersonalDrag);
    };
  }, []);

  function iniciarArrastePointer(event, source) {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") event.preventDefault();
    if (touchDrag.current) window.clearTimeout(touchDrag.current.timer);
    const gesture = { source, x: event.clientX, y: event.clientY, pointerType: event.pointerType, active: false, target: null, timer: null };
    if (event.pointerType === "touch") gesture.timer = window.setTimeout(() => {
      gesture.active = true;
      setDragging(source);
    }, 320);
    touchDrag.current = gesture;
  }

  async function compartilharTarefa(mode) {
    if (!sharePrompt) return;
    const { task, friendship, groupId } = sharePrompt;
    setSavingTask(true);
    setTaskError("");
    const recurrence = task.recorrencia || (Number(task.repeteDias) > 0
      ? Number(task.repeteDias) === 30 ? { tipo: "meses", intervalo: 1 } : { tipo: "dias", intervalo: Number(task.repeteDias) }
      : null);
    const dueDate = task.limite || (task.limiteHora ? hojeISO() : null);
    const siblings = tasks.filter((item) => item.friendship_id === friendship.friendship_id && (item.group_id || null) === groupId);
    const { error: insertError } = await supabase.from("social_tasks").insert({
      friendship_id: friendship.friendship_id,
      created_by: user.id,
      group_id: groupId,
      title: task.texto,
      description: task.descricao || "",
      comment: task.comentario || "",
      due_date: dueDate,
      due_time: dueDate ? task.limiteHora || null : null,
      priority: task.prioridade || 0,
      completed: false,
      partial: Boolean(task.meio),
      position: siblings.length,
      recurrence,
      recurrence_time: recurrence ? task.repeteHora || "00:00" : null,
      scheduled_for: task.agendadaPara || hojeISO(),
    });
    if (insertError) {
      setTaskError("Não consegui compartilhar essa tarefa. Tente novamente.");
      setSavingTask(false);
      return;
    }
    scheduleCollaborationNotificationDispatch();
    if (mode === "move") onMovePersonalTask?.(task.id);
    setSharePrompt(null);
    await loadTasks().catch(() => {});
    setSavingTask(false);
  }

  function requestSharePrompt(task, target) {
    const friendshipId = target.type === "friend" ? target.id : target.friendshipId;
    const friendship = friends.find((friend) => friend.friendship_id === friendshipId);
    if (!friendship || !task?.id) { setDragging(null); setDropTarget(null); return; }
    const groupId = target.type === "group" ? target.id : target.type === "task" ? target.groupId || null : null;
    setCollapsedFriends((current) => ({ ...current, [friendshipId]: false }));
    if (groupId) setCollapsedGroups((current) => ({ ...current, [groupId]: false }));
    setSharePrompt({ task, friendship, groupId });
    setDragging(null);
    setDropTarget(null);
  }
  sharePromptCallback.current = requestSharePrompt;

  function receberTarefaPessoal(event) {
    const encoded = event.dataTransfer?.getData("application/x-crysalis-task");
    if (!encoded) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const task = JSON.parse(encoded);
      const element = event.target.closest("[data-social-drop-kind]");
      const data = element?.dataset || {};
      if (!task?.id) return;
      requestSharePrompt(task, { type: data.socialDropKind, id: data.socialId, groupId: data.socialGroupId || null, friendshipId: data.socialFriendshipId });
    } catch {
      setTaskError("Não consegui ler os dados dessa tarefa. Tente arrastá-la novamente.");
    }
  }

  async function moverPorTeclado(source, delta) {
    if (source.type === "friend") {
      const ordered = friendsOrdered(); const index = ordered.findIndex((friend) => friend.friendship_id === source.id); const target = ordered[index + delta];
      if (target) await soltarItem({ preventDefault() {}, stopPropagation() {} }, { type: "friend", id: target.friendship_id }, source);
    } else if (source.type === "group") {
      const siblings = taskGroups.filter((group) => group.friendship_id === source.friendshipId).sort((a, b) => a.position - b.position);
      const index = siblings.findIndex((group) => group.id === source.id); const target = siblings[index + delta];
      if (target) await soltarItem({ preventDefault() {}, stopPropagation() {} }, { type: "group", id: target.id, friendshipId: source.friendshipId }, source);
    } else if (source.type === "task") {
      const siblings = tasks.filter((task) => task.friendship_id === source.friendshipId && (task.group_id || null) === source.groupId).sort((a, b) => a.position - b.position);
      const index = siblings.findIndex((task) => task.id === source.id); const target = siblings[index + delta];
      if (target) await soltarItem({ preventDefault() {}, stopPropagation() {} }, { type: "task", id: target.id, friendshipId: source.friendshipId, groupId: source.groupId }, source);
    }
  }

  if (view === "manage" || (view === "hub" && socialSection === "settings")) {
    return <section className={`ck-social-page${view === "hub" ? " ck-social-hub" : ""}`}>
      {view === "hub" && <nav className="ck-abas ck-abas-principais ck-social-hub-tabs" role="tablist" aria-label="Social"><button type="button" role="tab" className="ck-aba" aria-selected={false} onClick={() => setSocialSection("tasks")}>Tarefas em conjunto</button><button type="button" role="tab" className="ck-aba" aria-selected={true} onClick={() => setSocialSection("settings")}>Configurações</button></nav>}
      <div className="ck-social-heading ck-social-area-heading"><div><span className="ck-social-icon"><IconePessoa /></span><div><h2>Social</h2><p>Adicione pessoas e aceite pedidos para organizar tarefas em conjunto.</p></div></div><button type="button" className="secundario" onClick={() => refresh()}>Atualizar</button></div>
      <form className="ck-social-search" onSubmit={search}>
        <label htmlFor="ck-social-query">Encontrar alguém</label>
        <div><input id="ck-social-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome de usuário ou email" autoCapitalize="none" autoCorrect="off" /><button type="submit" disabled={searching || !query.trim()}>{searching ? "Buscando…" : "Buscar"}</button></div>
        <small>Use o nome de usuário ou o email exato da conta.</small>
      </form>
      {foundUser && <div className="ck-social-result"><span>{nomeVisivel(foundUser.display_name)}</span><button type="button" onClick={sendRequest} disabled={busyId === foundUser.user_id}>{busyId === foundUser.user_id ? "Enviando…" : "Adicionar"}</button></div>}
      {notice && <p className="ck-social-message" role="status">{notice}</p>}
      {error && <p className="ck-social-message erro" role="alert">{error}</p>}
      <section className="ck-social-list">
        <h3>Pedidos recebidos {requests.filter((item) => item.direction === "incoming").length > 0 && <span>{requests.filter((item) => item.direction === "incoming").length}</span>}</h3>
        {loading ? <p>Carregando…</p> : requests.filter((item) => item.direction === "incoming").length === 0 ? <p className="ck-social-empty">Nenhum pedido recebido.</p> : requests.filter((item) => item.direction === "incoming").map((item) => <div className="ck-social-person" key={item.request_id}><span>{nomeVisivel(item.display_name)}</span><div><button type="button" disabled={busyId === item.request_id} onClick={() => respond(item, true)}>Aceitar</button><button type="button" className="secundario" disabled={busyId === item.request_id} onClick={() => respond(item, false)}>Recusar</button></div></div>)}
      </section>
      <section className="ck-social-list">
        <h3>Pedidos enviados</h3>
        {loading ? <p>Carregando…</p> : requests.filter((item) => item.direction === "outgoing").length === 0 ? <p className="ck-social-empty">Nenhum pedido pendente.</p> : requests.filter((item) => item.direction === "outgoing").map((item) => <div className="ck-social-person" key={item.request_id}><span>{nomeVisivel(item.display_name)}</span><small>Aguardando resposta</small></div>)}
      </section>
      <section className="ck-social-list">
        <h3>Amigos {friends.length > 0 && <span>{friends.length}</span>}</h3>
        {loading ? <p>Carregando…</p> : friends.length === 0 ? <p className="ck-social-empty">Quando alguém aceitar seu pedido, aparecerá aqui.</p> : friends.map((friend) => <div className="ck-social-person" key={friend.friendship_id}><span><IconePessoa />{nomeVisivel(friend.display_name)}</span><small>Amigos desde {new Date(friend.created_at).toLocaleDateString("pt-BR")}</small><button type="button" className="ck-icone ck-social-remove" aria-label={`Remover ${nomeVisivel(friend.display_name)} dos amigos`} title="Remover amizade e apagar tarefas em conjunto" onClick={() => setConfirm({ type: "friend", item: friend, title: "Remover amizade?", message: `Isso também vai excluir todas as tarefas compartilhadas e sessões com ${nomeVisivel(friend.display_name)} para vocês dois.`, action: "Remover amizade" })}>×</button></div>)}
      </section>
      <ConfirmacaoSocial confirm={confirm} busy={busyId === "confirm"} onCancel={() => setConfirm(null)} onConfirm={confirmarAcao} />
    </section>;
  }

  if (loading && friends.length === 0) return <section className="ck-social-tasks"><p>Carregando tarefas compartilhadas…</p></section>;

  return <section className={`ck-social-tasks${view === "hub" ? " ck-social-hub" : ""}`} onDragOver={(event) => { if (Array.from(event.dataTransfer?.types || []).includes("application/x-crysalis-task") && event.target.closest("[data-social-drop-kind]")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={receberTarefaPessoal}>
    {view === "hub" && <nav className="ck-abas ck-abas-principais ck-social-hub-tabs" role="tablist" aria-label="Social"><button type="button" role="tab" className="ck-aba" aria-selected={true} onClick={() => setSocialSection("tasks")}>Tarefas em conjunto</button><button type="button" role="tab" className="ck-aba" aria-selected={false} onClick={() => setSocialSection("settings")}>Configurações</button></nav>}
    <div className="ck-social-tasks-heading ck-social-area-heading">{view === "friend-detail" ? <><button type="button" className="ck-social-back" onClick={onBack}>‹ <span>Amigos</span></button><div><span className="ck-social-icon"><IconePessoa /></span><h2>{nomeVisivel(friends.find((item) => item.friendship_id === friendshipId)?.display_name || "Amizade")}</h2></div></> : <div><span className="ck-social-icon"><IconePessoa /></span><h2>Amigos</h2></div>}</div>
    {error && <p className="ck-social-message erro" role="alert">{error}</p>}
    {taskError && <p className="ck-social-message erro" role="alert">{taskError}</p>}
    {friends.length === 0 ? <p className="ck-social-empty">Adicione alguém em Social para começar a compartilhar tarefas.</p> : friendsOrdered().filter((friend) => view !== "friend-detail" || friend.friendship_id === friendshipId).map((friend) => {
      const friendGroups = taskGroups.filter((group) => group.friendship_id === friend.friendship_id);
      const friendTasks = tasks.filter((task) => task.friendship_id === friend.friendship_id && (!task.scheduled_for || task.scheduled_for <= hojeISO()));
      const notesOpen = friendViews[friend.friendship_id] === "notes";
      const opened = view === "friend-detail";
      const unfiledTasks = friendTasks.filter((task) => !task.group_id || !friendGroups.some((g) => g.id === task.group_id));
      const addKey = (groupId) => `${friend.friendship_id}:${groupId || "root"}`;
      const openForm = (groupId) => addingFor === addKey(groupId);
      const taskList = (list, showEmpty = true) => list.length ? <ul className="ck-social-task-list">{[...list].sort((a, b) => a.position - b.position || String(a.created_at || "").localeCompare(String(b.created_at || ""))).map((task) => <TarefaCompartilhada key={task.id} task={task} source={{ type: "task", id: task.id, friendshipId: friend.friendship_id, groupId: task.group_id || null }} dragging={dragging} dropTarget={dropTarget} now={now} busy={savingTask} onKeyboardMove={moverPorTeclado} onPointerStart={iniciarArrastePointer} onToggle={toggleTask} onEdit={(id, fields) => editTask(id, fields)} onDelete={(item) => confirmarExclusaoTarefaAmigo(friend, item)} />)}</ul> : showEmpty ? <p className="ck-vazio-grupo">Nenhuma tarefa aqui ainda.</p> : null;
      const friendSource = { type: "friend", id: friend.friendship_id };
      const friendDragging = dragging?.type === "friend" && dragging.id === friend.friendship_id;
      const friendTarget = dropTarget?.type === "friend" && dropTarget.id === friend.friendship_id;
      const showBody = opened;
      return <section data-social-drop-kind="friend" data-social-id={friend.friendship_id} data-social-friendship-id={friend.friendship_id} className={`ck-social-friend-group${opened ? " ck-social-friend-detail" : ""}${friendDragging ? " arrastando" : ""}${friendTarget ? " alvo" : ""}`} key={friend.friendship_id}>
        {!opened && <header className="ck-social-friend-heading"><SocialAlca item={friendSource} onKeyboardMove={moverPorTeclado} onPointerStart={iniciarArrastePointer} label={nomeVisivel(friend.display_name)} /><button type="button" className="ck-social-collapse" onClick={() => onOpenFriend?.(friend.friendship_id)} aria-label={`Abrir tarefas com ${nomeVisivel(friend.display_name)}`}><IconePessoa /><strong>{nomeVisivel(friend.display_name)}</strong><span className="ck-grupo-qtd">{friendTasks.filter((t) => t.completed).length}/{friendTasks.length}</span></button></header>}
        {showBody && <div className={`ck-social-friend-body${!notesOpen && !friendGroups.length && !friendTasks.length ? " ck-social-friend-body-empty" : ""}`}>
          <div className="ck-abas ck-abas-principais ck-social-work-tabs" role="tablist" aria-label={`${nomeVisivel(friend.display_name)}: tarefas e anotações`}><button type="button" role="tab" className="ck-aba" aria-selected={!notesOpen} onClick={() => { if (notesOpen) alternarVisaoAmigo(friend.friendship_id); }}>Checklist</button><button type="button" role="tab" className="ck-aba" aria-selected={notesOpen} onClick={() => { if (!notesOpen) alternarVisaoAmigo(friend.friendship_id); }}>Anotações</button></div>
          {notesOpen ? <AnotacoesCompartilhadas key={`amizade:${friend.friendship_id}`} tipo="amizade" escopoId={friend.friendship_id} /> : <>
          <div className="ck-barras-topo"><button type="button" className="ck-barra-mais" onClick={() => { setAddingFor(openForm(null) ? "" : addKey(null)); setGroupForm(null); }}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar tarefa</span></button><button type="button" className="ck-barra-mais" onClick={() => { setGroupForm({ friendshipId: friend.friendship_id, group: null }); setAddingFor(""); }}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar sessão</span></button></div>
          {openForm(null) && <TaskEditor busy={savingTask} onCancel={() => setAddingFor("")} onSave={(fields) => saveTask(friend, fields)} />}
          {groupForm?.friendshipId === friend.friendship_id && !groupForm.group && <GroupEditor onCancel={() => setGroupForm(null)} onSave={(fields) => salvarGrupo(friend.friendship_id, fields)} />}
          {friendGroups.map((group) => {
            const groupCollapsed = Boolean(collapsedGroups[group.id]);
            const groupTasks = friendTasks.filter((task) => task.group_id === group.id);
            const groupSource = { type: "group", id: group.id, friendshipId: friend.friendship_id };
            const groupDragging = dragging?.type === "group" && dragging.id === group.id;
            const groupTarget = dropTarget?.type === "group" && dropTarget.id === group.id;
            return <section data-social-drop-kind="group" data-social-id={group.id} data-social-friendship-id={friend.friendship_id} className={`ck-grupo ck-social-shared-session${groupCollapsed ? " recolhida" : ""}${groupDragging ? " arrastando" : ""}${groupTarget ? " alvo" : ""}`} key={group.id}>
              <header className="ck-grupo-topo">
                <SocialAlca item={groupSource} onKeyboardMove={moverPorTeclado} onPointerStart={iniciarArrastePointer} label={group.name} />
                <button type="button" className="ck-grupo-titulo" aria-expanded={!groupCollapsed} onClick={() => setCollapsedGroups((v) => ({ ...v, [group.id]: !v[group.id] }))}><span className={`ck-seta ${!groupCollapsed ? "aberta" : ""}`}>›</span><IconeGrupo tipo={group.icon} /><span className="ck-grupo-nome">{group.name}</span><span className="ck-grupo-qtd">{groupTasks.filter((t) => t.completed).length}/{groupTasks.length}</span></button>
                {groupForm?.group?.id !== group.id && <><button type="button" className="ck-mais ck-mais-circular" onClick={() => { setCollapsedGroups((v) => ({ ...v, [group.id]: false })); setAddingFor(openForm(group.id) ? "" : addKey(group.id)); setGroupForm(null); }} aria-label={`Adicionar tarefa em ${group.name}`} title="Adicionar tarefa"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg></button><button type="button" className="ck-icone" title="Editar sessão" aria-label="Editar sessão" onClick={() => { setCollapsedGroups((v) => ({ ...v, [group.id]: false })); setGroupForm({ friendshipId: friend.friendship_id, group }); }}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button><button type="button" className="ck-icone ck-social-remove" title="Apagar sessão" aria-label="Apagar sessão" onClick={() => setConfirm({ type: "group", item: group, title: "Apagar sessão?", message: `A sessão “${group.name}” será removida. As tarefas ficam em “Sem sessão” para vocês dois.`, action: "Apagar sessão" })}>×</button></>}
              </header>
              {!groupCollapsed && <div className="ck-social-session-body">{groupForm?.group?.id === group.id && <GroupEditor group={group} onCancel={() => setGroupForm(null)} onSave={(fields) => salvarGrupo(friend.friendship_id, fields, group)} />}{openForm(group.id) && <TaskEditor groupId={group.id} busy={savingTask} onCancel={() => setAddingFor("")} onSave={(fields) => saveTask(friend, fields)} />}{taskList(groupTasks)}</div>}
            </section>;
          })}
          {friendGroups.length === 0 && friendTasks.length === 0 && <p className="ck-intro-organizacao">Lembre-se: cresça no seu tempo</p>}
          <div data-social-drop-kind="unfiled" data-social-friendship-id={friend.friendship_id} className={`ck-social-unfiled${dropTarget?.type === "unfiled" && dropTarget.friendshipId === friend.friendship_id ? " alvo" : ""}`}><h2 className="ck-secao">Sem sessão</h2>{taskList(unfiledTasks)}</div>
          </>}
        </div>}
      </section>;
    })}
    {sharePrompt && <div className="ck-social-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !savingTask) setSharePrompt(null); }}><section className="ck-social-modal" role="dialog" aria-modal="true" aria-labelledby="ck-social-share-title"><h2 id="ck-social-share-title">Compartilhar tarefa?</h2><p>“{sharePrompt.task.texto}” será adicionada às tarefas com {nomeVisivel(sharePrompt.friendship.display_name)}{sharePrompt.groupId ? `, na sessão “${taskGroups.find((group) => group.id === sharePrompt.groupId)?.name || ""}”` : ""}. Você pode mover a tarefa ou manter uma cópia pessoal.</p>{taskError && <p className="ck-social-message erro" role="alert">{taskError}</p>}<div><button type="button" disabled={savingTask} onClick={() => compartilharTarefa("move")}>{savingTask ? "Salvando…" : "Mover tarefa"}</button><button type="button" className="secundario" disabled={savingTask} onClick={() => compartilharTarefa("duplicate")}>Duplicar tarefa</button><button type="button" className="secundario" disabled={savingTask} onClick={() => setSharePrompt(null)}>Cancelar</button></div></section></div>}
    <ConfirmacaoSocial confirm={confirm} busy={busyId === "confirm"} onCancel={() => setConfirm(null)} onConfirm={confirmarAcao} />
  </section>;
}

