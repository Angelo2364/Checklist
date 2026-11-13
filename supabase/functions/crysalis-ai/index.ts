import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const todayInSaoPaulo = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const statusToFields = (status: unknown) => {
  if (status === undefined) return {};
  if (!["pending", "in_progress", "completed"].includes(String(status))) throw new Error("Status inválido. Use pending, in_progress ou completed.");
  return { feita: status === "completed", meio: status === "in_progress" };
};
const taskView = (task: Record<string, unknown>, sessions: Record<string, unknown>[] = []) => ({
  id: task.id,
  title: task.texto,
  status: task.feita ? "completed" : task.meio ? "in_progress" : "pending",
  scheduledFor: task.agendadaPara || null,
  dueDate: task.limite || null,
  dueTime: task.limiteHora || null,
  priority: Number(task.prioridade || 0),
  sessionId: task.grupoId || null,
  sessionName: sessions.find((session) => String(session.id) === String(task.grupoId))?.nome || null,
  description: task.descricao || "",
  comment: task.comentario || "",
  recurring: Boolean(task.rotinaId || task.recorrencia || Number(task.repeteDias || 0) > 0),
});
const eventView = (event: Record<string, unknown>) => ({
  id: event.id,
  title: event.titulo,
  date: event.data,
  startTime: event.hora || "",
  endTime: event.horaFim || "",
  location: event.endereco || "",
  description: event.descricao || "",
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in to Crysalis before connecting this action." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return json({ error: "Crysalis API is not configured." }, 500);
    const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "The Crysalis authorization has expired. Connect again." }, 401);
    const userId = authData.user.id;

    const route = new URL(request.url).pathname.split("/crysalis-ai").pop()?.replace(/^\/+|\/+$/g, "") || "";
    const segments = route.split("/").filter(Boolean).map(decodeURIComponent);
    const collection = segments[0] || "";
    const itemId = segments[1];
    if (!["tasks", "events", "sessions"].includes(collection || "")) return json({ error: "Unknown Crysalis resource." }, 404);
    if (collection === "sessions" && request.method !== "GET") return json({ error: "Sessions are read-only through this connector." }, 405);

    const { data: row, error: readError } = await supabase.from("user_data").select("data, updated_at").eq("user_id", userId).maybeSingle();
    if (readError) throw readError;
    const appData = row?.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};

    if (request.method === "GET" && collection === "sessions") {
      const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
      return json({ sessions: sessions.map((session) => ({ id: session.id, title: session.nome })).filter((session) => session.id && session.title) });
    }

    if (request.method === "GET") {
      const items = Array.isArray(appData[collection]) ? appData[collection] as Record<string, unknown>[] : [];
      if (itemId) {
        const found = items.find((item) => String(item.id) === itemId);
        if (!found) return json({ error: `${collection === "tasks" ? "Task" : "Event"} not found in this Crysalis account.` }, 404);
        const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
        return json({ [collection === "tasks" ? "task" : "event"]: collection === "tasks" ? taskView(found, sessions) : eventView(found) });
      }
      const query = new URL(request.url).searchParams;
      const q = cleanText(query.get("q"), 120).toLocaleLowerCase();
      const from = query.get("from");
      const to = query.get("to");
      if ((from && !validDate(from)) || (to && !validDate(to))) return json({ error: "Dates must use YYYY-MM-DD." }, 400);
      const filtered = items.filter((item) => {
        const title = String(collection === "tasks" ? item.texto || "" : item.titulo || "");
        if (q && !title.toLocaleLowerCase().includes(q)) return false;
        const dates = collection === "tasks"
          ? [item.agendadaPara, item.limite].filter((date): date is string => typeof date === "string" && Boolean(date))
          : [item.data].filter((date): date is string => typeof date === "string" && Boolean(date));
        if ((from || to) && !dates.some((date) => (!from || date >= from) && (!to || date <= to))) return false;
        return true;
      });
      const requestedLimit = Number(query.get("limit") || 100);
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return json({ error: "limit must be an integer between 1 and 250." }, 400);
      const limit = Math.min(requestedLimit, 250);
      const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
      return json({ [collection]: filtered.slice(0, limit).map((item) => collection === "tasks" ? taskView(item, sessions) : eventView(item)), total: filtered.length, updatedAt: row?.updated_at || null });
    }

    if (collection === "sessions") return json({ error: "Unsupported action." }, 405);
    const isTask = collection === "tasks";
    const supabaseCollection = isTask ? "tarefas" : "eventos";

    if (request.method === "POST" && !itemId) {
      const body = await request.json() as Record<string, unknown>;
      const title = cleanText(body.title, 160);
      if (!title) return json({ error: "A title is required." }, 400);
      let item: Record<string, unknown>;
      if (isTask) {
        const dueDate = body.dueDate == null || body.dueDate === "" ? "" : body.dueDate;
        const scheduledFor = body.scheduledFor == null || body.scheduledFor === "" ? "" : body.scheduledFor;
        const dueTime = body.dueTime == null || body.dueTime === "" ? "" : body.dueTime;
        if (dueDate && !validDate(dueDate)) return json({ error: "dueDate must use a valid YYYY-MM-DD date." }, 400);
        if (scheduledFor && !validDate(scheduledFor)) return json({ error: "scheduledFor must use a valid YYYY-MM-DD date." }, 400);
        if (dueTime && !validTime(dueTime)) return json({ error: "dueTime must use 24-hour HH:mm format." }, 400);
        const priority = body.priority == null ? 0 : Number(body.priority);
        if (!Number.isInteger(priority) || priority < 0 || priority > 3) return json({ error: "priority must be an integer from 0 to 3." }, 400);
        const sessionId = body.sessionId || null;
        if (sessionId) {
          const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
          if (!sessions.some((session) => String(session.id) === String(sessionId))) return json({ error: "That session does not exist in this Crysalis account." }, 400);
        }
        item = {
          id: crypto.randomUUID(), texto: title, feita: false, meio: false, grupoId: sessionId,
          repeteDias: 0, criadaEm: Date.now(), prioridade: priority,
          limite: dueDate || (dueTime ? todayInSaoPaulo() : ""), limiteHora: dueTime,
          descricao: cleanText(body.description, 4000), comentario: cleanText(body.comment, 1000),
          ...(scheduledFor ? { agendadaPara: scheduledFor } : {}),
        };
      } else {
        if (!validDate(body.date)) return json({ error: "date must use a valid YYYY-MM-DD date." }, 400);
        if (body.startTime && !validTime(body.startTime)) return json({ error: "startTime must use 24-hour HH:mm format." }, 400);
        if (body.endTime && !validTime(body.endTime)) return json({ error: "endTime must use 24-hour HH:mm format." }, 400);
        item = {
          id: crypto.randomUUID(), titulo: title, data: body.date,
          hora: body.startTime || "", horaFim: body.endTime || "",
          endereco: cleanText(body.location, 500), descricao: cleanText(body.description, 4000),
        };
      }
      const { data, error } = await supabase.rpc("crysalis_ai_mutate_personal_item", { p_collection: supabaseCollection, p_action: "create", p_item_id: String(item.id), p_item: item });
      if (error) throw error;
      const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
      return json({ [isTask ? "task" : "event"]: isTask ? taskView(data.item, sessions) : eventView(data.item) }, 201);
    }

    if ((request.method === "PATCH" || request.method === "DELETE") && itemId) {
      const existing = (Array.isArray(appData[supabaseCollection]) ? appData[supabaseCollection] as Record<string, unknown>[] : []).find((item) => String(item.id) === itemId);
      if (!existing) return json({ error: `${isTask ? "Task" : "Event"} not found in this Crysalis account.` }, 404);
      if (request.method === "DELETE") {
        const { error } = await supabase.rpc("crysalis_ai_mutate_personal_item", { p_collection: supabaseCollection, p_action: "delete", p_item_id: itemId, p_item: {} });
        if (error) throw error;
        return json({ deleted: true, id: itemId, title: isTask ? existing.texto : existing.titulo });
      }

      const body = await request.json() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) {
        const title = cleanText(body.title, 160);
        if (!title) return json({ error: "A title cannot be empty." }, 400);
        patch[isTask ? "texto" : "titulo"] = title;
      }
      if (isTask) {
        if (body.scheduledFor !== undefined) {
          if (body.scheduledFor !== null && body.scheduledFor !== "" && !validDate(body.scheduledFor)) return json({ error: "scheduledFor must use YYYY-MM-DD or null." }, 400);
          patch.agendadaPara = body.scheduledFor || null;
        }
        if (body.dueDate !== undefined) {
          if (body.dueDate !== null && body.dueDate !== "" && !validDate(body.dueDate)) return json({ error: "dueDate must use YYYY-MM-DD or null." }, 400);
          patch.limite = body.dueDate || (body.dueTime ? todayInSaoPaulo() : "");
          if (!body.dueDate) patch.limiteHora = body.dueTime || "";
        }
        if (body.dueTime !== undefined) {
          if (body.dueTime !== null && body.dueTime !== "" && !validTime(body.dueTime)) return json({ error: "dueTime must use HH:mm or null." }, 400);
          patch.limiteHora = body.dueTime || "";
          if (body.dueTime && !patch.limite && !existing.limite) patch.limite = todayInSaoPaulo();
        }
        if (body.priority !== undefined) {
          const priority = Number(body.priority);
          if (!Number.isInteger(priority) || priority < 0 || priority > 3) return json({ error: "priority must be an integer from 0 to 3." }, 400);
          patch.prioridade = priority;
        }
        if (body.sessionId !== undefined) {
          const sessionId = body.sessionId || null;
          if (sessionId) {
            const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
            if (!sessions.some((session) => String(session.id) === String(sessionId))) return json({ error: "That session does not exist in this Crysalis account." }, 400);
          }
          patch.grupoId = sessionId;
        }
        if (body.status !== undefined) Object.assign(patch, statusToFields(body.status));
        if (body.description !== undefined) patch.descricao = cleanText(body.description, 4000);
        if (body.comment !== undefined) patch.comentario = cleanText(body.comment, 1000);
      } else {
        if (body.date !== undefined) {
          if (!validDate(body.date)) return json({ error: "date must use a valid YYYY-MM-DD date." }, 400);
          patch.data = body.date;
        }
        if (body.startTime !== undefined) {
          if (body.startTime !== "" && body.startTime !== null && !validTime(body.startTime)) return json({ error: "startTime must use HH:mm or null." }, 400);
          patch.hora = body.startTime || "";
        }
        if (body.endTime !== undefined) {
          if (body.endTime !== "" && body.endTime !== null && !validTime(body.endTime)) return json({ error: "endTime must use HH:mm or null." }, 400);
          patch.horaFim = body.endTime || "";
        }
        if (body.location !== undefined) patch.endereco = cleanText(body.location, 500);
        if (body.description !== undefined) patch.descricao = cleanText(body.description, 4000);
      }
      if (!Object.keys(patch).length) return json({ error: "Provide at least one field to update." }, 400);
      const { data, error } = await supabase.rpc("crysalis_ai_mutate_personal_item", { p_collection: supabaseCollection, p_action: "update", p_item_id: itemId, p_item: patch });
      if (error) throw error;
      const sessions = Array.isArray(appData.grupos) ? appData.grupos as Record<string, unknown>[] : [];
      return json({ [isTask ? "task" : "event"]: isTask ? taskView(data.item, sessions) : eventView(data.item) });
    }

    return json({ error: "Unsupported method or missing item id." }, 405);
  } catch (error) {
    console.error("crysalis-ai:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("item_not_found") ? 404 : message.includes("authentication_required") ? 401 : 500;
    return json({ error: status === 500 ? "The Crysalis action could not be completed. Try again." : message }, status);
  }
});
