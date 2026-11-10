import { useCallback, useEffect, useState } from "react";
import { supabase } from "./services/supabase";

const ERROS_SOCIAL = {
  user_not_found: "Não encontrei uma conta com esse nome de usuário ou email.",
  cannot_add_self: "Você não pode enviar um pedido para si mesmo.",
  already_friends: "Vocês já são amigos.",
  request_already_sent: "O pedido já foi enviado.",
  incoming_request_exists: "Essa pessoa já enviou um pedido. Confira os pedidos recebidos.",
  request_not_found: "Esse pedido já foi respondido ou não está mais disponível.",
};

function mensagemErro(error, fallback) {
  const detalhe = error?.message || "";
  const codigo = Object.keys(ERROS_SOCIAL).find((item) => detalhe.includes(item));
  return codigo ? ERROS_SOCIAL[codigo] : fallback;
}

function IconePessoa() {
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.8 17c.4-3.1 2.8-5 6.2-5s5.8 1.9 6.2 5" /></svg>;
}

function TaskEditor({ initial, onSave, onCancel, busy }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [dueDate, setDueDate] = useState(initial?.due_date || "");
  const [priority, setPriority] = useState(initial?.priority || 0);

  async function submit(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    await onSave({ title: cleanTitle, description: description.trim(), due_date: dueDate || null, priority });
  }

  return <form className="ck-social-task-form" onSubmit={submit}>
    <input autoFocus maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que vocês precisam fazer?" aria-label="Nome da tarefa compartilhada" required />
    <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" aria-label="Descrição da tarefa compartilhada" />
    <div className="ck-social-task-options">
      <label>Prazo <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      <label>Prioridade <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
        <option value={0}>Normal</option><option value={1}>Baixa</option><option value={2}>Média</option><option value={3}>Alta</option>
      </select></label>
    </div>
    <div className="ck-social-form-actions">
      <button type="submit" disabled={busy || !title.trim()}>{busy ? "Salvando…" : initial ? "Salvar" : "Criar tarefa"}</button>
      <button type="button" className="secundario" onClick={onCancel} disabled={busy}>Cancelar</button>
    </div>
  </form>;
}

function TarefaCompartilhada({ task, onToggle, onEdit, onDelete, busy }) {
  const [editing, setEditing] = useState(false);
  const priorityLabel = ["Normal", "Baixa", "Média", "Alta"][task.priority || 0];
  return <article className={"ck-social-task" + (task.completed ? " concluida" : "")}>
    {editing ? <TaskEditor initial={task} busy={busy} onCancel={() => setEditing(false)} onSave={async (fields) => { if (await onEdit(task.id, fields)) setEditing(false); }} /> : <>
      <button type="button" className={"ck-social-check" + (task.completed ? " feita" : "")} onClick={() => onToggle(task)} aria-label={task.completed ? "Marcar tarefa como pendente" : "Marcar tarefa como concluída"}>{task.completed ? "✓" : ""}</button>
      <div className="ck-social-task-content">
        <strong>{task.title}</strong>
        {task.description && <p>{task.description}</p>}
        <div className="ck-social-task-meta">
          {task.due_date && <time dateTime={task.due_date}>Prazo: {new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</time>}
          {(task.priority || 0) > 0 && <span className={"ck-social-priority p" + task.priority}>{priorityLabel}</span>}
        </div>
      </div>
      <div className="ck-social-task-actions">
        <button type="button" className="ck-icone" onClick={() => setEditing(true)} aria-label={"Editar " + task.title} title="Editar"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" /></svg></button>
        <button type="button" className="ck-icone ck-social-remove" onClick={() => onDelete(task)} aria-label={"Apagar " + task.title} title="Apagar">×</button>
      </div>
    </>}
  </article>;
}

export default function Social({ user, view = "tasks", onManage }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
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

  const loadTasks = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("social_tasks").select("*").order("position").order("created_at");
    if (loadError) throw loadError;
    setTasks(data || []);
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    const [friendsResult, requestsResult, tasksResult] = await Promise.all([
      supabase.rpc("social_list_friends"),
      supabase.rpc("social_list_requests"),
      supabase.from("social_tasks").select("*").order("position").order("created_at"),
    ]);
    const failure = friendsResult.error || requestsResult.error || tasksResult.error;
    if (failure) {
      setError("Não consegui carregar a área Social. Confira se a migração do Supabase foi aplicada e tente novamente.");
      setLoading(false);
      return;
    }
    setFriends(friendsResult.data || []);
    setRequests(requestsResult.data || []);
    setTasks(tasksResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    refresh();
    const channel = supabase.channel("social-tasks-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_tasks" }, () => { if (active) loadTasks().catch(() => {}); })
      .subscribe();
    const timer = window.setInterval(() => { if (active) refresh(); }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [user.id, refresh, loadTasks]);

  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setNotice("");
    setError("");
    setFoundUser(null);
    const { data, error: searchError } = await supabase.rpc("social_search_user", { p_query: query.trim() });
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
      setNotice("Pedido enviado para " + foundUser.display_name + ".");
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
      setNotice(accept ? "Agora você e " + request.display_name + " são amigos." : "Pedido recusado.");
      await refresh();
    }
    setBusyId("");
  }

  async function saveTask(friendship, fields, task = null) {
    setSavingTask(true);
    setTaskError("");
    const result = task
      ? await supabase.from("social_tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", task.id)
      : await supabase.from("social_tasks").insert({
          friendship_id: friendship.friendship_id,
          created_by: user.id,
          title: fields.title,
          description: fields.description,
          due_date: fields.due_date,
          priority: fields.priority,
          position: tasks.filter((item) => item.friendship_id === friendship.id).length,
        });
    if (result.error) {
      setTaskError("Não consegui salvar essa tarefa compartilhada. Tente novamente.");
      setSavingTask(false);
      return false;
    }
    setAddingFor("");
    await loadTasks().catch(() => setTaskError("A tarefa foi salva, mas não consegui atualizar a lista."));
    setSavingTask(false);
    return true;
  }

  async function toggleTask(task) {
    const { error: updateError } = await supabase.from("social_tasks").update({ completed: !task.completed, updated_at: new Date().toISOString() }).eq("id", task.id);
    if (updateError) setTaskError("Não consegui atualizar essa tarefa. Tente novamente.");
    else await loadTasks().catch(() => {});
  }

  async function editTask(taskId, fields) {
    const { error: updateError } = await supabase.from("social_tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", taskId);
    if (updateError) {
      setTaskError("Não consegui editar essa tarefa. Tente novamente.");
      return false;
    }
    await loadTasks().catch(() => {});
    return true;
  }

  async function deleteTask(task) {
    if (!window.confirm("Apagar “" + task.title + "” para você e sua pessoa amiga?")) return;
    const { error: deleteError } = await supabase.from("social_tasks").delete().eq("id", task.id);
    if (deleteError) setTaskError("Não consegui apagar essa tarefa. Tente novamente.");
    else await loadTasks().catch(() => {});
  }

  if (view === "manage") {
    return <section className="ck-social-page">
      <div className="ck-social-heading"><div><span className="ck-social-icon"><IconePessoa /></span><div><h2>Social</h2><p>Adicione pessoas e aceite pedidos para organizar tarefas em conjunto.</p></div></div><button type="button" className="secundario" onClick={() => refresh()}>Atualizar</button></div>
      <form className="ck-social-search" onSubmit={search}>
        <label htmlFor="ck-social-query">Encontrar alguém</label>
        <div><input id="ck-social-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome de usuário ou email" autoCapitalize="none" autoCorrect="off" /><button type="submit" disabled={searching || !query.trim()}>{searching ? "Buscando…" : "Buscar"}</button></div>
        <small>Use o nome de usuário ou o email exato da conta.</small>
      </form>
      {foundUser && <div className="ck-social-result"><span>{foundUser.display_name}</span><button type="button" onClick={sendRequest} disabled={busyId === foundUser.user_id}>{busyId === foundUser.user_id ? "Enviando…" : "Adicionar"}</button></div>}
      {notice && <p className="ck-social-message" role="status">{notice}</p>}
      {error && <p className="ck-social-message erro" role="alert">{error}</p>}
      <section className="ck-social-list">
        <h3>Pedidos recebidos {requests.filter((item) => item.direction === "incoming").length > 0 && <span>{requests.filter((item) => item.direction === "incoming").length}</span>}</h3>
        {loading ? <p>Carregando…</p> : requests.filter((item) => item.direction === "incoming").length === 0 ? <p className="ck-social-empty">Nenhum pedido recebido.</p> : requests.filter((item) => item.direction === "incoming").map((item) => <div className="ck-social-person" key={item.request_id}><span>{item.display_name}</span><div><button type="button" disabled={busyId === item.request_id} onClick={() => respond(item, true)}>Aceitar</button><button type="button" className="secundario" disabled={busyId === item.request_id} onClick={() => respond(item, false)}>Recusar</button></div></div>)}
      </section>
      <section className="ck-social-list">
        <h3>Pedidos enviados</h3>
        {loading ? <p>Carregando…</p> : requests.filter((item) => item.direction === "outgoing").length === 0 ? <p className="ck-social-empty">Nenhum pedido pendente.</p> : requests.filter((item) => item.direction === "outgoing").map((item) => <div className="ck-social-person" key={item.request_id}><span>{item.display_name}</span><small>Aguardando resposta</small></div>)}
      </section>
      <section className="ck-social-list">
        <h3>Amigos {friends.length > 0 && <span>{friends.length}</span>}</h3>
        {loading ? <p>Carregando…</p> : friends.length === 0 ? <p className="ck-social-empty">Quando alguém aceitar seu pedido, aparecerá aqui.</p> : friends.map((friend) => <div className="ck-social-person" key={friend.friendship_id}><span><IconePessoa />{friend.display_name}</span><small>Amigos desde {new Date(friend.created_at).toLocaleDateString("pt-BR")}</small></div>)}
      </section>
    </section>;
  }

  if (loading && friends.length === 0) return <section className="ck-social-tasks"><p>Carregando tarefas compartilhadas…</p></section>;

  return <section className="ck-social-tasks">
    <div className="ck-social-tasks-heading"><div><span className="ck-social-icon"><IconePessoa /></span><h2>Tarefas em conjunto</h2></div><button type="button" className="ck-link ck-social-manage-link" onClick={onManage}>Gerenciar pessoas</button></div>
    {error && <p className="ck-social-message erro" role="alert">{error}</p>}
    {taskError && <p className="ck-social-message erro" role="alert">{taskError}</p>}
    {friends.length === 0 ? <p className="ck-social-empty">Adicione alguém em Social para começar a compartilhar tarefas.</p> : friends.map((friend) => {
      const friendTasks = tasks.filter((task) => task.friendship_id === friend.friendship_id);
      const openForm = addingFor === friend.friendship_id;
      return <section className="ck-social-friend-group" key={friend.friendship_id}>
        <div className="ck-social-friend-heading"><strong>Tarefas com {friend.display_name}</strong><button type="button" className="ck-mais ck-mais-circular" onClick={() => setAddingFor(openForm ? "" : friend.friendship_id)} aria-expanded={openForm} aria-label={"Adicionar tarefa com " + friend.display_name} title="Nova tarefa compartilhada"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg></button></div>
        {openForm && <TaskEditor busy={savingTask} onCancel={() => setAddingFor("")} onSave={(fields) => saveTask(friend, fields)} />}
        {friendTasks.length === 0 && !openForm ? <p className="ck-social-empty">Nenhuma tarefa compartilhada ainda.</p> : friendTasks.map((task) => <TarefaCompartilhada key={task.id} task={task} busy={savingTask} onToggle={toggleTask} onEdit={(id, fields) => editTask(id, fields)} onDelete={deleteTask} />)}
      </section>;
    })}
  </section>;
}

