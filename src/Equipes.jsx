import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./services/supabase";

const z2 = (n) => String(n).padStart(2, "0");
const nome = (s = "") => s ? s[0].toLocaleUpperCase("pt-BR") + s.slice(1) : s;
const DIAS = [[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[0,"Dom"]];
const OPCOES_REPETE = [["0","Não repete"],["1","Todo dia"],["3","A cada 3 dias"],["30","Uma vez por mês"],["personalizado","Intervalo personalizado"]];
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${z2(d.getMonth()+1)}-${z2(d.getDate())}`; };
function dataSeguinte(dia, mes, atual = "") {
  if (!dia || !mes) return "";
  const now = new Date(); now.setHours(0,0,0,0);
  if (atual && atual.slice(5,7) === mes && atual.slice(8,10) === dia) { const old = new Date(`${atual}T00:00:00`); if (old >= now) return atual; }
  for (let year = now.getFullYear(); year <= now.getFullYear()+4; year++) {
    const d = new Date(year, Number(mes)-1, Number(dia));
    if (d.getMonth() === Number(mes)-1 && d.getDate() === Number(dia) && d >= now) return `${year}-${z2(Number(mes))}-${z2(Number(dia))}`;
  }
  return "";
}
function DataDiaMesEquipe({ value, onChange }) {
  const [dia, setDia] = useState(value?.slice(8,10) || "");
  const [mes, setMes] = useState(value?.slice(5,7) || "");
  useEffect(() => { setDia(value?.slice(8,10) || ""); setMes(value?.slice(5,7) || ""); }, [value]);
  return <span className="ck-hora24 ck-social-diammes" role="group" aria-label="Prazo: dia e mês"><input type="text" inputMode="numeric" maxLength={2} placeholder="dd" value={dia} aria-label="Dia do prazo" onChange={(e) => { let d=e.target.value.replace(/\D/g,"").slice(0,2); if(d.length===1&&Number(d)>3)d=`0${d}`; if(Number(d)>31)d="31"; setDia(d); onChange(dataSeguinte(d,mes,value)); }} onBlur={() => { const d=dia?dia.padStart(2,"0"):""; setDia(d); onChange(dataSeguinte(d,mes,value)); }} /><span>/</span><input type="text" inputMode="numeric" maxLength={2} placeholder="mm" value={mes} aria-label="Mês do prazo" onChange={(e) => { let m=e.target.value.replace(/\D/g,"").slice(0,2); if(m.length===1&&Number(m)>1)m=`0${m}`; if(Number(m)>12)m="12"; setMes(m); onChange(dataSeguinte(dia,m,value)); }} onBlur={() => { const m=mes?mes.padStart(2,"0"):""; setMes(m); onChange(dataSeguinte(dia,m,value)); }} /></span>;
}
function Hora24Equipe({ value, onChange, opcional = false }) {
  const [h,setH] = useState(value?.slice(0,2)||""); const [m,setM] = useState(value?.slice(3,5)||"");
  useEffect(() => { setH(value?.slice(0,2)||""); setM(value?.slice(3,5)||""); },[value]);
  const update=(next,field)=>{ const s=next.replace(/\D/g,"").slice(0,2); const v=field==="h"?(Number(s)>23?"23":s):(Number(s)>59?"59":s); const hh=field==="h"?v:h, mm=field==="m"?v:m; field==="h"?setH(v):setM(v); onChange(hh&&mm?`${z2(Number(hh))}:${z2(Number(mm))}`:""); };
  const blur=(field)=>{ const current=field==="h"?h:m; if(!current)return; const v=z2(Number(current)); field==="h"?setH(v):setM(v); const hh=field==="h"?v:h, mm=field==="m"?v:m; onChange(hh&&mm?`${z2(Number(hh))}:${z2(Number(mm))}`:""); };
  return <span className="ck-hora24" role="group" aria-label="Horário"><input type="text" inputMode="numeric" maxLength={2} placeholder={opcional?"--":"00"} value={h} aria-label="Hora" onChange={(e)=>update(e.target.value,"h")} onBlur={()=>blur("h")}/><span>:</span><input type="text" inputMode="numeric" maxLength={2} placeholder={opcional?"--":"00"} value={m} aria-label="Minuto" onChange={(e)=>update(e.target.value,"m")} onBlur={()=>blur("m")}/></span>;
}
function repeticaoDaTarefa(task) { const r=task?.recurrence; if(!r)return "0"; if(r.tipo==="semana")return "personalizado"; if(r.tipo==="meses")return Number(r.intervalo)===1?"30":"personalizado"; return [1,3].includes(Number(r.intervalo))?String(r.intervalo):"personalizado"; }
function recurrencePayload(option, config) { if(option==="personalizado")return config; if(option==="30")return {tipo:"meses",intervalo:1}; return Number(option)>0?{tipo:"dias",intervalo:Number(option)}:null; }

function EditorTarefa({ tarefa, grupos, onSave, onCancel }) {
  const formRef = useRef(null);
  const [titulo, setTitulo] = useState(tarefa?.title || "");
  const [descricao, setDescricao] = useState(tarefa?.description || "");
  const [comentario, setComentario] = useState(tarefa?.comment || "");
  const [prazo, setPrazo] = useState(tarefa?.due_date || "");
  const [hora, setHora] = useState(tarefa?.due_time?.slice(0, 5) || "");
  const [repetir, setRepetir] = useState(repeticaoDaTarefa(tarefa));
  const [config, setConfig] = useState(tarefa?.recurrence || { tipo:"dias", intervalo:2, diasSemana:[] });
  const [horaRepeticao, setHoraRepeticao] = useState(tarefa?.recurrence_time?.slice(0,5) || "00:00");
  const [comentarioAberto, setComentarioAberto] = useState(Boolean(tarefa?.comment));
  const [parcial, setParcial] = useState(Boolean(tarefa?.partial));
  const recurrence = recurrencePayload(repetir, config);
  useEffect(() => { const outside=(e)=>{ if(formRef.current && !formRef.current.contains(e.target)) onCancel(); }; document.addEventListener("pointerdown",outside,true); return ()=>document.removeEventListener("pointerdown",outside,true); },[onCancel]);
  return <form ref={formRef} className="ck-form-grupo ck-team-editor" onSubmit={(e) => { e.preventDefault(); if (titulo.trim() && (recurrence?.tipo!=="semana" || recurrence.diasSemana?.length)) onSave({ title: titulo.trim(), description: descricao.trim(), comment: comentario.trim(), due_date: prazo || (hora ? hoje() : null), due_time: (prazo || hora) ? (hora || null) : null, recurrence, recurrence_time: recurrence ? horaRepeticao : null, partial: parcial }); }}>
    <input autoFocus maxLength={200} required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que a equipe precisa fazer?" aria-label="Título da tarefa" onKeyDown={(e)=>e.key==="Escape"&&onCancel()} />
    <div className="ck-social-repeat-row"><select value={repetir} onChange={(e)=>setRepetir(e.target.value)} aria-label="Frequência da tarefa">{OPCOES_REPETE.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>{repetir!=="0"&&<Hora24Equipe value={horaRepeticao} onChange={setHoraRepeticao}/>}</div>
    {repetir==="personalizado"&&<div className="ck-repeticao-personalizada ck-social-repeat-custom"><label className="ck-repeticao-tipo">Repetir por<select value={config.tipo} onChange={(e)=>setConfig((v)=>({...v,tipo:e.target.value}))}><option value="dias">A cada N dias</option><option value="semana">Dias da semana</option><option value="meses">A cada N meses</option></select></label>{config.tipo==="semana"?<div className="ck-dias-semana" aria-label="Dias da semana">{DIAS.map(([d,label])=><label key={d} className={(config.diasSemana||[]).includes(d)?"selecionado":""}><input type="checkbox" checked={(config.diasSemana||[]).includes(d)} onChange={(e)=>setConfig((v)=>({...v,diasSemana:e.target.checked?[...new Set([...(v.diasSemana||[]),d])].sort((a,b)=>DIAS.findIndex(([x])=>x===a)-DIAS.findIndex(([x])=>x===b)):(v.diasSemana||[]).filter((x)=>x!==d)}))}/>{label}</label>)}</div>:<label className="ck-repeticao-intervalo">A cada<input type="number" min="1" max={config.tipo==="meses"?24:365} value={config.intervalo||1} onChange={(e)=>setConfig((v)=>({...v,intervalo:Math.max(1,Number(e.target.value)||1)}))}/>{config.tipo==="meses"?"meses":"dias"}</label>}</div>}
    <div className="ck-prazo-campos"><span className="ck-prazo-rotulo">Prazo</span><DataDiaMesEquipe value={prazo} onChange={setPrazo}/><Hora24Equipe value={hora} onChange={setHora} opcional/></div>
    <textarea className="ck-campo-largo" rows={2} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" aria-label="Descrição" onKeyDown={(e)=>{if(e.key==="Escape")onCancel();else if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
    {tarefa && <label className="ck-limite-horario"><input type="checkbox" checked={parcial} onChange={(e) => setParcial(e.target.checked)} /><span>Meio pronta</span></label>}
    <div className="ck-tarefa-form-rodape"><div className="ck-tarefa-form-botoes"><span className="ck-edit-acoes"><button type="submit" disabled={!titulo.trim()||(recurrence?.tipo==="semana"&&!recurrence.diasSemana?.length)}>{tarefa?"Salvar":"Adicionar"}</button><button type="button" className="ck-icone" onClick={onCancel} aria-label="Cancelar">×</button></span></div>{comentarioAberto&&<textarea className="ck-comentario-input" rows={1} maxLength={1000} value={comentario} onChange={(e)=>setComentario(e.target.value)} placeholder="Comentário (opcional)" aria-label="Comentário" onKeyDown={(e)=>{if(e.key==="Escape")onCancel();else if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>}<button type="button" className="ck-comentario-botao" aria-label={comentarioAberto?"Ocultar comentário":"Adicionar comentário"} aria-expanded={comentarioAberto} title="Comentário" onClick={()=>setComentarioAberto((v)=>!v)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 7.7a5.6 5.6 0 0 1-5.8 5.1 6.2 6.2 0 0 1-2.5-.5L2 13l.8-2.7a5 5 0 0 1-.8-2.6A5.5 5.5 0 0 1 7.8 2.5h.4a5.5 5.5 0 0 1 5.3 5.2z"/></svg></button></div>
  </form>;
}

function EditorNota({ nota, onSave, onCancel }) {
  const [titulo, setTitulo] = useState(nota?.title || "");
  const [texto, setTexto] = useState(nota?.body || "");
  return <form className="ck-form-grupo ck-team-note-editor" onSubmit={(e) => { e.preventDefault(); if (titulo.trim()) onSave({ title: titulo.trim(), body: texto.trim() }); }}><input autoFocus maxLength={100} required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título da anotação" /><textarea className="ck-campo-largo" rows={3} maxLength={5000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Anotação (opcional)" /><div className="ck-edit-acoes"><button type="submit">{nota ? "Salvar" : "Adicionar anotação"}</button><button type="button" className="ck-icone" onClick={onCancel} aria-label="Cancelar">×</button></div></form>;
}

function ConfirmacaoEquipe({ item, onClose, onConfirm }) {
  if (!item) return null;
  return <div className="ck-social-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="ck-social-modal" role="alertdialog" aria-modal="true" aria-labelledby="ck-team-confirm-title"><h2 id="ck-team-confirm-title">{item.title}</h2><p>{item.message}</p><div><button type="button" className="ck-social-danger" onClick={onConfirm}>{item.action || "Excluir"}</button><button type="button" className="secundario" onClick={onClose}>Cancelar</button></div></section></div>;
}

export default function Equipes({ user }) {
  const [friends, setFriends] = useState([]);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [notes, setNotes] = useState([]);
  const [current, setCurrent] = useState("");
  const [teamCreateOpen, setTeamCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [friendToAdd, setFriendToAdd] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [taskEditor, setTaskEditor] = useState(null);
  const [noteEditor, setNoteEditor] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [teamSettingsOpen, setTeamSettingsOpen] = useState(false);
  const team = teams.find((t) => t.id === current);

  const refresh = useCallback(async () => {
    const [f, t] = await Promise.all([
      supabase.rpc("social_list_friends"),
      supabase.from("teams").select("*").order("position").order("created_at"),
    ]);
    if (f.error || t.error) { setError("Não consegui carregar as equipes. Confira se a migração do Supabase foi aplicada."); return; }
    setFriends(f.data || []); setTeams(t.data || []);
    if (!current && t.data?.length) setCurrent(t.data[0].id);
    if (current && !t.data?.some((x) => x.id === current)) setCurrent(t.data?.[0]?.id || "");
  }, [current]);

  const loadTeam = useCallback(async (teamId) => {
    if (!teamId) { setMembers([]); setTasks([]); setGroups([]); setNotes([]); return; }
    const [m, t, g, n] = await Promise.all([
      supabase.from("team_members").select("team_id,user_id,created_at").eq("team_id", teamId),
      supabase.from("team_tasks").select("*").eq("team_id", teamId).order("position").order("created_at"),
      supabase.from("team_task_groups").select("*").eq("team_id", teamId).order("position").order("created_at"),
      supabase.from("shared_notes").select("*").eq("team_id", teamId).order("position").order("created_at"),
    ]);
    const failure = m.error || t.error || g.error || n.error;
    if (failure) { setError("Não consegui abrir os dados desta equipe."); return; }
    setMembers(m.data || []); setTasks(t.data || []); setGroups(g.data || []); setNotes(n.data || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { loadTeam(current); }, [current, loadTeam]);
  useEffect(() => {
    if (!current) return undefined;
    const channel = supabase.channel(`team-${current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `id=eq.${current}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_tasks", filter: `team_id=eq.${current}` }, () => loadTeam(current))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_task_groups", filter: `team_id=eq.${current}` }, () => loadTeam(current))
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_notes", filter: `team_id=eq.${current}` }, () => loadTeam(current))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members", filter: `team_id=eq.${current}` }, () => { loadTeam(current); refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [current, loadTeam, refresh]);

  async function createTeam(e) {
    e.preventDefault(); if (!teamName.trim()) return; setBusy(true); setError("");
    const { data, error: createError } = await supabase.from("teams").insert({ name: teamName.trim(), owner_id: user.id }).select("id").single();
    if (!createError) {
      const { error: memberError } = await supabase.from("team_members").insert({ team_id: data.id, user_id: user.id, added_by: user.id });
      if (memberError) setError("A equipe foi criada, mas não consegui registrar você como integrante.");
      else if (selectedFriendIds.length) {
        const { error: friendsError } = await supabase.from("team_members").insert(selectedFriendIds.map((friendId) => ({ team_id: data.id, user_id: friendId, added_by: user.id })));
        if (friendsError) setError("A equipe foi criada, mas não consegui adicionar todos os amigos escolhidos. Você pode ajustar isso nas configurações da equipe.");
      }
      setTeamName(""); setSelectedFriendIds([]); setTeamSettingsOpen(false); setTeamCreateOpen(false); setCurrent(data.id); await refresh();
    } else setError("Não consegui criar a equipe. Tente novamente.");
    setBusy(false);
  }

  async function addMember(e) {
    e.preventDefault(); if (!friendToAdd || !team) return; setBusy(true);
    const { error: addError } = await supabase.from("team_members").insert({ team_id: team.id, user_id: friendToAdd, added_by: user.id });
    if (addError) setError("Não consegui adicionar essa pessoa. Confirme que vocês são amigos e que ela já não está na equipe.");
    else { setFriendToAdd(""); await loadTeam(team.id); }
    setBusy(false);
  }

  async function saveTask(fields) {
    if (!team) return; setBusy(true);
    const result = taskEditor?.id
      ? await supabase.from("team_tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", taskEditor.id)
      : await supabase.from("team_tasks").insert({ ...fields, group_id: taskEditor?.groupId || null, team_id: team.id, created_by: user.id, scheduled_for: hoje(), position: tasks.length });
    if (result.error) setError("Não consegui salvar a tarefa compartilhada.");
    else { setTaskEditor(null); await loadTeam(team.id); }
    setBusy(false);
  }
  async function saveNote(fields) {
    if (!team) return; setBusy(true);
    const result = noteEditor?.id
      ? await supabase.from("shared_notes").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", noteEditor.id)
      : await supabase.from("shared_notes").insert({ ...fields, team_id: team.id, created_by: user.id, position: notes.length });
    if (result.error) setError("Não consegui salvar a anotação compartilhada.");
    else { setNoteEditor(null); await loadTeam(team.id); }
    setBusy(false);
  }
  async function createGroup(e) {
    e.preventDefault(); if (!groupName.trim() || !team) return;
    const { error: groupError } = await supabase.from("team_task_groups").insert({ team_id: team.id, created_by: user.id, name: groupName.trim(), position: groups.length });
    if (groupError) setError("Não consegui criar a sessão."); else { setGroupName(""); setGroupFormOpen(false); await loadTeam(team.id); }
  }
  async function removeMember(member) {
    if (!team || (member.user_id !== user.id && team.owner_id !== user.id)) return;
    if (!window.confirm(member.user_id === user.id ? "Sair desta equipe?" : "Remover esta pessoa da equipe?")) return;
    const { error: removeError } = await supabase.from("team_members").delete().eq("team_id", team.id).eq("user_id", member.user_id);
    if (removeError) setError("Não consegui remover a pessoa da equipe."); else await loadTeam(team.id);
  }
  async function setTaskStatus(task, partial) {
    const next = task.completed ? { completed: false, partial: false } : task.partial ? { completed: true, partial: false } : partial ? { completed: false, partial: true } : { completed: true, partial: false };
    const { error: updateError } = await supabase.from("team_tasks").update({ ...next, updated_at: new Date().toISOString() }).eq("id", task.id);
    if (updateError) setError("Não consegui atualizar o status."); else await loadTeam(team.id);
  }
  async function deleteTask(task) {
    setConfirm({ title: "Excluir tarefa compartilhada?", message: `“${task.title}” será removida para todos da equipe.`, action: "Excluir para todos", confirm: async () => { const { error: deleteError } = await supabase.from("team_tasks").delete().eq("id", task.id); setConfirm(null); if (deleteError) setError("Não consegui excluir a tarefa."); else await loadTeam(team.id); } });
  }
  async function deleteNote(note) {
    setConfirm({ title: "Excluir anotação?", message: `“${note.title}” será removida para todos da equipe.`, action: "Excluir anotação", confirm: async () => { const { error: deleteError } = await supabase.from("shared_notes").delete().eq("id", note.id); setConfirm(null); if (deleteError) setError("Não consegui excluir a anotação."); else await loadTeam(team.id); } });
  }
  async function changePriority(task) {
    const { error: updateError } = await supabase.from("team_tasks").update({ priority: ((task.priority || 0) + 1) % 4, updated_at: new Date().toISOString() }).eq("id", task.id);
    if (updateError) setError("Não consegui atualizar a prioridade."); else await loadTeam(team.id);
  }
  async function deleteGroup(group) {
    setConfirm({ title: "Excluir sessão?", message: `“${group.name}” será removida. As tarefas serão movidas para “Sem sessão”.`, action: "Excluir sessão", confirm: async () => { const { error: deleteError } = await supabase.from("team_task_groups").delete().eq("id", group.id); setConfirm(null); if (deleteError) setError("Não consegui excluir a sessão."); else await loadTeam(team.id); } });
  }
  async function deleteTeam() {
    if (!team || team.owner_id !== user.id) return;
    setConfirm({ title: "Excluir equipe?", message: `“${team.name}”, suas tarefas e anotações serão removidas para todos os integrantes.`, action: "Excluir equipe", confirm: async () => { const { error: deleteError } = await supabase.from("teams").delete().eq("id", team.id); setConfirm(null); if (deleteError) setError("Não consegui excluir a equipe."); else { setCurrent(""); await refresh(); } } });
  }

  const friendById = new Map(friends.map((f) => [f.friend_id, f]));
  const labelMember = (id) => id === user.id ? "Você" : nome(friendById.get(id)?.display_name || "Integrante");
  return <section className="ck-social-page ck-teams-page">
    <header className="ck-social-heading"><div><span className="ck-social-icon"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="14" cy="6" r="2.4"/><path d="M1.8 16c.3-2.7 1.8-4 4.2-4h.2m11.9 4c-.3-2.7-1.8-4-4.2-4h-.2M6 16c.3-3.4 1.6-5 4-5s3.7 1.6 4 5"/></svg></span><div><h2>Equipes</h2><p>Organize tarefas e anotações com várias pessoas.</p></div></div></header>
    {error && <p className="ck-social-message erro" role="alert">{error}</p>}
    <div className="ck-team-create-area"><button type="button" className="ck-barra-mais" aria-expanded={teamCreateOpen} onClick={() => setTeamCreateOpen((open) => !open)}><span className="ck-mais" aria-hidden="true">+</span><span>{teamCreateOpen ? "Cancelar criação" : "Criar equipe"}</span></button>{teamCreateOpen&&<form className="ck-social-search ck-team-create" onSubmit={createTeam}><label htmlFor="ck-team-name">Nome da equipe</label><div><input id="ck-team-name" maxLength={60} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ex.: Projeto da viagem" /><button type="submit" disabled={busy || !teamName.trim()}>Criar equipe</button></div><fieldset className="ck-team-create-friends"><legend>Quem vai participar?</legend>{friends.length ? friends.map((friend) => <label key={friend.friend_id}><input type="checkbox" checked={selectedFriendIds.includes(friend.friend_id)} onChange={(e) => setSelectedFriendIds((ids) => e.target.checked ? [...new Set([...ids, friend.friend_id])] : ids.filter((id) => id !== friend.friend_id))} /><span>{nome(friend.display_name)}</span></label>) : <small>Adicione amigos no Social para convidá-los a uma equipe.</small>}</fieldset></form>}</div>
    {teams.length > 0 && <nav className="ck-team-tabs" aria-label="Suas equipes">{teams.map((t) => <button type="button" className={current === t.id ? "ativo" : ""} key={t.id} onClick={() => { setCurrent(t.id); setTaskEditor(null); setNoteEditor(null); setTeamSettingsOpen(false); }}>{t.name}</button>)}</nav>}
    {!teams.length ? <p className="ck-social-empty">Crie uma equipe para começar a compartilhar tarefas e anotações.</p> : team && <>
      <section className="ck-team-panel"><header><h3>{team.name}</h3><div className="ck-team-settings-controls"><span>{members.length} integrante{members.length === 1 ? "" : "s"}</span><button type="button" className="ck-icone" title="Configurações da equipe" aria-label="Configurações da equipe" aria-expanded={teamSettingsOpen} onClick={() => setTeamSettingsOpen((open) => !open)}>⚙</button></div></header>
        {teamSettingsOpen && <div className="ck-team-settings"><h4>Integrantes da equipe</h4><div className="ck-team-members">{members.map((m) => <div key={m.user_id}><span>{labelMember(m.user_id)}</span>{(team.owner_id === user.id || m.user_id === user.id) && <button type="button" className="ck-icone ck-social-remove" title={m.user_id === user.id ? "Sair da equipe" : "Remover integrante"} onClick={() => removeMember(m)}>×</button>}</div>)}</div>{team.owner_id === user.id && <form className="ck-team-add-member" onSubmit={addMember}><select aria-label="Amigo para adicionar" value={friendToAdd} onChange={(e) => setFriendToAdd(e.target.value)}><option value="">Escolha um amigo</option>{friends.filter((f) => !members.some((m) => m.user_id === f.friend_id)).map((f) => <option key={f.friend_id} value={f.friend_id}>{nome(f.display_name)}</option>)}</select><button type="submit" disabled={!friendToAdd || busy}>Adicionar integrante</button><button type="button" className="ck-team-delete" onClick={deleteTeam}>Excluir equipe</button></form>}</div>}
      </section>
      <section className="ck-team-panel ck-team-work-panel"><header><h3>Tarefas compartilhadas</h3></header>
        <div className="ck-barras-topo ck-team-toolbar"><button type="button" className="ck-barra-mais" onClick={() => setTaskEditor((v) => v && !v.id && v.groupId == null ? null : { groupId: null })}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar tarefa</span></button><button type="button" className="ck-barra-mais" onClick={() => setGroupFormOpen((v)=>!v)}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar sessão</span></button></div>
        {taskEditor && !taskEditor.id && taskEditor.groupId == null && <EditorTarefa grupos={groups} onSave={saveTask} onCancel={() => setTaskEditor(null)} />}
        {groupFormOpen&&<form className="ck-nova-divisao ck-team-session-editor" onSubmit={createGroup}><input autoFocus maxLength={60} value={groupName} onChange={(e)=>setGroupName(e.target.value)} placeholder="Nome da sessão" aria-label="Nome da sessão"/><button type="submit" disabled={!groupName.trim()}>Criar</button><button type="button" className="ck-icone" onClick={()=>setGroupFormOpen(false)} aria-label="Cancelar">×</button></form>}
        {groups.map((g) => { const groupTasks=tasks.filter((t)=>t.group_id===g.id); const collapsed=Boolean(collapsedGroups[g.id]); const editingTask=taskEditor?.id?groupTasks.find((t)=>t.id===taskEditor.id):null; return <section className="ck-team-task-group ck-team-session" key={g.id}><header><button type="button" className="ck-grupo-titulo" aria-expanded={!collapsed} onClick={()=>setCollapsedGroups((v)=>({...v,[g.id]:!v[g.id]}))}><span className={`ck-seta ${!collapsed?"aberta":""}`}>›</span><span className="ck-grupo-nome">{g.name}</span><span className="ck-grupo-qtd">{groupTasks.filter((t)=>t.completed).length}/{groupTasks.length}</span></button>{!collapsed&&<><button type="button" className="ck-mais ck-mais-circular" title="Adicionar tarefa nesta sessão" aria-label={`Adicionar tarefa em ${g.name}`} onClick={()=>setTaskEditor((v)=>v&&!v.id&&v.groupId===g.id?null:{groupId:g.id})}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg></button><button type="button" className="ck-icone ck-social-remove" aria-label={`Excluir sessão ${g.name}`} title="Excluir sessão" onClick={()=>deleteGroup(g)}>×</button></>}</header>{!collapsed&&<div className="ck-team-session-body">{taskEditor&&!taskEditor.id&&taskEditor.groupId===g.id&&<EditorTarefa grupos={groups} onSave={saveTask} onCancel={()=>setTaskEditor(null)}/ >}{editingTask&&<EditorTarefa tarefa={editingTask} grupos={groups} onSave={saveTask} onCancel={()=>setTaskEditor(null)}/ >}{groupTasks.filter((t)=>t.id!==taskEditor?.id).map((t)=><TaskRow key={t.id} task={t} status={setTaskStatus} priority={changePriority} edit={()=>setTaskEditor({id:t.id})} remove={()=>deleteTask(t)}/>)}</div>}</section>; })}
        <section className="ck-team-task-group ck-team-session"><h4>Sem sessão</h4>{taskEditor?.id&&!tasks.find((t)=>t.id===taskEditor.id)?.group_id&&<EditorTarefa tarefa={tasks.find((t)=>t.id===taskEditor.id)} grupos={groups} onSave={saveTask} onCancel={()=>setTaskEditor(null)}/ >}{tasks.filter((t)=>!t.group_id&&t.id!==taskEditor?.id).map((t)=><TaskRow key={t.id} task={t} status={setTaskStatus} priority={changePriority} edit={()=>setTaskEditor({id:t.id})} remove={()=>deleteTask(t)}/>)}{!tasks.length&&<p className="ck-social-empty">Nenhuma tarefa nesta equipe.</p>}</section>
      </section>
      <section className="ck-team-panel ck-team-work-panel"><header><h3>Anotações compartilhadas</h3></header>
        <div className="ck-barras-topo ck-team-toolbar"><button type="button" className="ck-barra-mais" onClick={() => setNoteEditor((v)=>v?null:{})}><span className="ck-mais" aria-hidden="true">+</span><span>Adicionar anotação</span></button></div>
        {noteEditor && <EditorNota nota={noteEditor.id ? notes.find((n) => n.id === noteEditor.id) : null} onSave={saveNote} onCancel={() => setNoteEditor(null)} />}
        {notes.map((n) => <article className="ck-team-note" key={n.id}><div className="ck-team-note-bubble"><div><strong>{n.title}</strong><time>{new Date(n.updated_at || n.created_at).toLocaleDateString("pt-BR")}</time></div>{n.body && <p>{n.body}</p>}</div><div className="ck-team-note-actions"><button type="button" className="ck-icone" aria-label={`Editar ${n.title}`} onClick={() => setNoteEditor({ id: n.id })}>✎</button><button type="button" className="ck-icone ck-social-remove" aria-label={`Excluir ${n.title}`} onClick={() => deleteNote(n)}>×</button></div></article>)}
        {!notes.length && !noteEditor && <p className="ck-social-empty">Nenhuma anotação compartilhada nesta equipe.</p>}
      </section>
    </>}
    <ConfirmacaoEquipe item={confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm?.confirm?.()} />
  </section>;
}

function TaskRow({ task, status, priority, edit, remove }) {
  return <article className={`ck-social-task-card ck-team-task-row${task.completed ? " feita" : ""}`}><button type="button" className={`ck-social-task-status${task.partial ? " parcial" : task.completed ? " feita" : ""}`} aria-label={task.completed ? "Reabrir tarefa" : task.partial ? "Marcar como concluída" : "Marcar como meio pronta"} onClick={() => status(task, !task.partial && !task.completed)}>{task.partial ? "◐" : task.completed ? "✓" : ""}</button><div className="ck-social-task-content"><strong>{task.title}</strong>{(task.due_date || task.due_time) && <small>Prazo: {task.due_date ? new Date(`${task.due_date}T00:00`).toLocaleDateString("pt-BR") : "hoje"}{task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ""}</small>}{task.comment && <small>💬 {task.comment}</small>}</div><button type="button" className={`ck-prio p${task.priority || 0}`} title="Alterar prioridade" aria-label={`Prioridade ${task.priority || 0}; alterar`} onClick={() => priority(task)} /><button type="button" className="ck-icone" aria-label={`Editar ${task.title}`} onClick={edit}>✎</button><button type="button" className="ck-icone ck-social-remove" aria-label={`Excluir ${task.title}`} onClick={remove}>×</button></article>;
}
