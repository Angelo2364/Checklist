import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function allowedOrigins() {
  return (Deno.env.get("CRYSALIS_ALLOWED_ORIGINS") || "https://crysalis.me,https://www.crysalis.me,http://localhost:5173")
    .split(",").map((value) => value.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null) {
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

function redirect(origin: string, query: Record<string, string>) {
  const url = new URL("/", origin);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return Response.redirect(url.toString(), 303);
}

function googleClientId() {
  const value = Deno.env.get("GOOGLE_CLIENT_ID");
  if (!value) throw new HttpError(503, "google_integration_not_configured");
  return value;
}

function googleClientSecret() {
  const value = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!value) throw new HttpError(503, "google_integration_not_configured");
  return value;
}

function redirectUri() {
  const explicit = Deno.env.get("GOOGLE_REDIRECT_URI");
  return explicit || `${SUPABASE_URL}/functions/v1/google-calendar`;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new HttpError(503, "google_encryption_key_not_configured");
  const raw = unbase64(encoded);
  if (raw.byteLength !== 32) throw new HttpError(503, "google_encryption_key_must_be_32_bytes_base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string, userId: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, key, new TextEncoder().encode(token));
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}

async function decryptToken(value: string, userId: string) {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) throw new HttpError(500, "google_token_ciphertext_invalid");
  const key = await encryptionKey();
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(encodedIv), additionalData: new TextEncoder().encode(userId) }, key, unbase64(encodedCiphertext));
  return new TextDecoder().decode(clear);
}

async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedInUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "authentication_required");
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "invalid_session");
  return data.user;
}

async function connectionFor(userId: string) {
  const { data, error } = await service.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(500, "google_connection_lookup_failed");
  if (!data) throw new HttpError(409, "google_calendar_not_connected");
  return data;
}

async function accessToken(connection: any, userId: string) {
  const refreshToken = await decryptToken(connection.encrypted_refresh_token, userId);
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleClientId(), client_secret: googleClientSecret(), refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    if (result.error === "invalid_grant") throw new HttpError(401, "google_authorization_revoked_reconnect_required");
    throw new HttpError(502, "google_token_refresh_failed");
  }
  return result.access_token as string;
}

async function googleRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${GOOGLE_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 401 || response.status === 403 ? 403 : 502;
    throw new HttpError(status, body?.error?.message || "google_calendar_request_failed");
  }
  return body;
}

function validIsoDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function addDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function googleEventBody(event: any, localEventId: string) {
  if (!validIsoDate(event?.data) || typeof event?.titulo !== "string" || !event.titulo.trim()) throw new HttpError(400, "invalid_event");
  const body: any = {
    summary: event.titulo.trim(),
    location: typeof event.endereco === "string" ? event.endereco : "",
    description: typeof event.descricao === "string" ? event.descricao : "",
    extendedProperties: { private: { crysalis: "true", crysalisEventId: localEventId } },
  };
  if (event.hora) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.hora)) throw new HttpError(400, "invalid_event_time");
    let endDate = event.data;
    let endTime = event.horaFim;
    if (!endTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
      const [hour, minute] = event.hora.split(":").map(Number);
      const endMinutes = hour * 60 + minute + 60;
      if (endMinutes >= 1440) endDate = addDays(endDate, 1);
      endTime = `${String(Math.floor(endMinutes % 1440 / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    } else if (endTime <= event.hora) endDate = addDays(endDate, 1);
    body.start = { dateTime: `${event.data}T${event.hora}:00-03:00`, timeZone: "America/Sao_Paulo" };
    body.end = { dateTime: `${endDate}T${endTime}:00-03:00`, timeZone: "America/Sao_Paulo" };
  } else {
    body.start = { date: event.data };
    body.end = { date: addDays(event.data, 1) };
  }
  return body;
}

function googleEventPatch(event: any) {
  const body = googleEventBody(event, "");
  delete body.extendedProperties;
  return body;
}

async function listCalendars(token: string) {
  const data = await googleRequest(token, "/users/me/calendarList?maxResults=250&showHidden=true");
  return (data?.items || []).map((calendar: any) => ({
    id: calendar.id,
    summary: calendar.summary || calendar.id,
    primary: Boolean(calendar.primary),
    accessRole: calendar.accessRole || "reader",
    selected: calendar.selected !== false,
    backgroundColor: calendar.backgroundColor || "",
  }));
}

async function handleCallback(url: URL) {
  const oauthError = url.searchParams.get("error");
  const state = url.searchParams.get("state") || "";
  if (!state || state.length > 256) return json({ error: "invalid_oauth_state" }, 400);
  const stateHash = await sha256(state);
  const { data: savedState, error: stateError } = await service.from("google_calendar_oauth_states").delete().eq("state_hash", stateHash).gt("expires_at", new Date().toISOString()).select("user_id,return_origin,encrypted_code_verifier").maybeSingle();
  if (stateError || !savedState || !allowedOrigins().includes(savedState.return_origin)) return json({ error: "oauth_state_expired" }, 400);
  if (oauthError) return redirect(savedState.return_origin, { googleCalendar: "error", reason: "consent_denied" });
  const code = url.searchParams.get("code");
  if (!code) return redirect(savedState.return_origin, { googleCalendar: "error", reason: "missing_code" });
  const codeVerifier = await decryptToken(savedState.encrypted_code_verifier, savedState.user_id);
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: googleClientId(), client_secret: googleClientSecret(), redirect_uri: redirectUri(), grant_type: "authorization_code", code_verifier: codeVerifier }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) return redirect(savedState.return_origin, { googleCalendar: "error", reason: "token_exchange_failed" });
  const { data: existing } = await service.from("google_calendar_connections")
    .select("encrypted_refresh_token,selected_calendar_ids,write_calendar_id")
    .eq("user_id", savedState.user_id).maybeSingle();
  const encryptedRefresh = result.refresh_token
    ? await encryptToken(result.refresh_token, savedState.user_id)
    : existing?.encrypted_refresh_token || "";
  const existingCalendars = Array.isArray(existing?.selected_calendar_ids) ? existing.selected_calendar_ids : [];
  const existingWriteCalendar = existing?.write_calendar_id || "";
  if (!encryptedRefresh) return redirect(savedState.return_origin, { googleCalendar: "error", reason: "missing_refresh_token" });
  let primaryCalendarId = "primary";
  try {
    const calendarsResponse = await fetch(`${GOOGLE_BASE}/users/me/calendarList?maxResults=250`, { headers: { Authorization: `Bearer ${result.access_token}` } });
    const calendarsBody = await calendarsResponse.json().catch(() => ({}));
    primaryCalendarId = calendarsBody.items?.find((calendar: any) => calendar.primary)?.id || "primary";
  } catch { /* o endpoint de calendários dará um erro legível ao abrir as configurações */ }
  const { error: saveError } = await service.from("google_calendar_connections").upsert({
    user_id: savedState.user_id,
    encrypted_refresh_token: encryptedRefresh,
    selected_calendar_ids: existingCalendars.length ? existingCalendars : [primaryCalendarId],
    write_calendar_id: existingWriteCalendar || primaryCalendarId,
    granted_scopes: result.scope || REQUIRED_SCOPES,
    updated_at: new Date().toISOString(),
  });
  if (saveError) return redirect(savedState.return_origin, { googleCalendar: "error", reason: "connection_save_failed" });
  return redirect(savedState.return_origin, { googleCalendar: "connected" });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  if (request.method === "GET" && (!action || action === "callback")) {
    try { return await handleCallback(url); }
    catch (error) { console.error("google calendar oauth callback failed", error); return json({ error: "google_oauth_callback_failed" }, 500, origin); }
  }

  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  try {
    const user = await signedInUser(request);
    const body = await request.json().catch(() => ({}));

    if (body.action === "start") {
      googleClientId(); googleClientSecret(); await encryptionKey();
      const returnOrigin = typeof body.returnOrigin === "string" ? body.returnOrigin : "";
      if (!allowedOrigins().includes(returnOrigin)) throw new HttpError(400, "return_origin_not_allowed");
      await service.from("google_calendar_oauth_states").delete().lt("expires_at", new Date().toISOString());
      const state = crypto.randomUUID();
      const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
      const verifier = base64(verifierBytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      const challenge = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
        .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      const { error } = await service.from("google_calendar_oauth_states").insert({ state_hash: await sha256(state), user_id: user.id, return_origin: returnOrigin, encrypted_code_verifier: await encryptToken(verifier, user.id), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      if (error) throw new HttpError(500, "oauth_state_save_failed");
      const authorization = new URL(GOOGLE_AUTH);
      authorization.search = new URLSearchParams({ client_id: googleClientId(), redirect_uri: redirectUri(), response_type: "code", scope: REQUIRED_SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
      return json({ authorizationUrl: authorization.toString() }, 200, origin);
    }

    if (body.action === "status") {
      const { data, error } = await service.from("google_calendar_connections").select("selected_calendar_ids,write_calendar_id,updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw new HttpError(500, "google_connection_lookup_failed");
      return json({ connected: Boolean(data), selectedCalendarIds: data?.selected_calendar_ids || ["primary"], writeCalendarId: data?.write_calendar_id || "primary", updatedAt: data?.updated_at || null }, 200, origin);
    }

    if (body.action === "disconnect") {
      const { data: connection, error: lookupError } = await service.from("google_calendar_connections").select("encrypted_refresh_token").eq("user_id", user.id).maybeSingle();
      if (lookupError) throw new HttpError(500, "google_connection_lookup_failed");
      if (connection) {
        const token = await decryptToken(connection.encrypted_refresh_token, user.id);
        const revokeResponse = await fetch(GOOGLE_REVOKE, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
        if (!revokeResponse.ok && revokeResponse.status !== 400) throw new HttpError(502, "google_revoke_failed");
      }
      const { error } = await service.from("google_calendar_connections").delete().eq("user_id", user.id);
      if (error) throw new HttpError(500, "google_disconnect_failed");
      return json({ connected: false }, 200, origin);
    }

    const connection = await connectionFor(user.id);
    const token = await accessToken(connection, user.id);

    if (body.action === "calendars") return json({ calendars: await listCalendars(token), selectedCalendarIds: connection.selected_calendar_ids || ["primary"] }, 200, origin);

    if (body.action === "select-calendars") {
      if (!Array.isArray(body.calendarIds) || body.calendarIds.length > 50 || body.calendarIds.some((id: unknown) => typeof id !== "string" || id.length > 512)) throw new HttpError(400, "invalid_calendar_selection");
      const calendars = await listCalendars(token);
      const allowedIds = new Set(calendars.map((calendar: any) => calendar.id));
      if (body.calendarIds.some((id: string) => !allowedIds.has(id))) throw new HttpError(400, "unknown_calendar");
      const { error } = await service.from("google_calendar_connections").update({ selected_calendar_ids: [...new Set(body.calendarIds)], updated_at: new Date().toISOString() }).eq("user_id", user.id);
      if (error) throw new HttpError(500, "calendar_selection_save_failed");
      return json({ selectedCalendarIds: [...new Set(body.calendarIds)] }, 200, origin);
    }

    if (body.action === "events") {
      const timeMin = typeof body.timeMin === "string" ? Date.parse(body.timeMin) : NaN;
      const timeMax = typeof body.timeMax === "string" ? Date.parse(body.timeMax) : NaN;
      if (!Number.isFinite(timeMin) || !Number.isFinite(timeMax) || timeMax <= timeMin || timeMax - timeMin > 93 * 24 * 60 * 60_000) throw new HttpError(400, "invalid_event_window");
      const calendars = await listCalendars(token);
      const selected = new Set(Array.isArray(connection.selected_calendar_ids) ? connection.selected_calendar_ids : ["primary"]);
      const visibleCalendars = calendars.filter((calendar: any) => selected.has(calendar.id));
      const results = await Promise.all(visibleCalendars.map(async (calendar: any) => {
        const params = new URLSearchParams({ timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeZone: typeof body.timeZone === "string" ? body.timeZone : "America/Sao_Paulo" });
        const data = await googleRequest(token, `/calendars/${encodeURIComponent(calendar.id)}/events?${params}`);
        return (data?.items || []).filter((event: any) => event.status !== "cancelled" && event.extendedProperties?.private?.crysalis !== "true").map((event: any) => {
          const start = event.start?.dateTime || event.start?.date || "";
          const end = event.end?.dateTime || event.end?.date || "";
          return {
            id: `${calendar.id}:${event.id}`,
            titulo: event.summary || "(Sem título)",
            data: start.slice(0, 10),
            hora: event.start?.dateTime ? start.slice(11, 16) : "",
            horaFim: event.end?.dateTime ? end.slice(11, 16) : "",
            endereco: event.location || "",
            descricao: event.description || "",
            googleReadOnly: true,
            googleWritable: calendar.accessRole === "owner",
            googleCalendarId: calendar.id,
            googleEventId: event.id,
            googleUrl: event.htmlLink || "",
            googleCalendarName: calendar.summary,
          };
        });
      }));
      return json({ events: results.flat().sort((a: any, b: any) => `${a.data}T${a.hora}`.localeCompare(`${b.data}T${b.hora}`)) }, 200, origin);
    }

    if (body.action === "upsert-event") {
      const event = body.event;
      const localEventId = typeof event?.id === "string" ? event.id : "";
      if (!localEventId || localEventId.length > 128) throw new HttpError(400, "invalid_local_event_id");
      const calendarId = connection.write_calendar_id || "primary";
      const resource = googleEventBody(event, localEventId);
      const { data: link } = await service.from("google_calendar_event_links").select("google_calendar_id,google_event_id").eq("user_id", user.id).eq("local_event_id", localEventId).maybeSingle();
      let saved;
      if (link) {
        try { saved = await googleRequest(token, `/calendars/${encodeURIComponent(link.google_calendar_id)}/events/${encodeURIComponent(link.google_event_id)}`, { method: "PUT", body: JSON.stringify(resource) }); }
        catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
      }
      if (!saved) saved = await googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(resource) });
      const { error } = await service.from("google_calendar_event_links").upsert({ user_id: user.id, local_event_id: localEventId, google_calendar_id: calendarId, google_event_id: saved.id, updated_at: new Date().toISOString() });
      if (error) throw new HttpError(500, "google_event_link_save_failed");
      return json({ synced: true, googleEventId: saved.id }, 200, origin);
    }

    if (body.action === "edit-google-event") {
      const calendarId = typeof body.calendarId === "string" ? body.calendarId : "";
      const googleEventId = typeof body.googleEventId === "string" ? body.googleEventId : "";
      if (!calendarId || calendarId.length > 512 || !googleEventId || googleEventId.length > 1024) throw new HttpError(400, "invalid_google_event_id");
      const calendars = await listCalendars(token);
      if (!calendars.some((calendar: any) => calendar.id === calendarId && calendar.accessRole === "owner")) throw new HttpError(403, "google_calendar_is_read_only");
      const resource = googleEventPatch(body.event);
      const saved = await googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, { method: "PATCH", body: JSON.stringify(resource) });
      return json({ updated: true, googleEventId: saved.id }, 200, origin);
    }

    if (body.action === "delete-google-event") {
      const calendarId = typeof body.calendarId === "string" ? body.calendarId : "";
      const googleEventId = typeof body.googleEventId === "string" ? body.googleEventId : "";
      if (!calendarId || calendarId.length > 512 || !googleEventId || googleEventId.length > 1024) throw new HttpError(400, "invalid_google_event_id");
      const calendars = await listCalendars(token);
      if (!calendars.some((calendar: any) => calendar.id === calendarId && calendar.accessRole === "owner")) throw new HttpError(403, "google_calendar_is_read_only");
      try { await googleRequest(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, { method: "DELETE" }); }
      catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
      return json({ deleted: true }, 200, origin);
    }

    if (body.action === "delete-event") {
      const localEventId = typeof body.eventId === "string" ? body.eventId : "";
      if (!localEventId || localEventId.length > 128) throw new HttpError(400, "invalid_local_event_id");
      const { data: link } = await service.from("google_calendar_event_links").select("google_calendar_id,google_event_id").eq("user_id", user.id).eq("local_event_id", localEventId).maybeSingle();
      if (link) {
        try { await googleRequest(token, `/calendars/${encodeURIComponent(link.google_calendar_id)}/events/${encodeURIComponent(link.google_event_id)}`, { method: "DELETE" }); }
        catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
        await service.from("google_calendar_event_links").delete().eq("user_id", user.id).eq("local_event_id", localEventId);
      }
      return json({ synced: Boolean(link) }, 200, origin);
    }

    if (body.action === "sync-existing") {
      const { data: row, error } = await service.from("user_data").select("data").eq("user_id", user.id).maybeSingle();
      if (error) throw new HttpError(500, "user_events_lookup_failed");
      const events = Array.isArray(row?.data?.eventos) ? row.data.eventos.slice(0, 300) : [];
      let synced = 0;
      for (const event of events) {
        if (!event?.id) continue;
        const { data: existing } = await service.from("google_calendar_event_links").select("google_event_id").eq("user_id", user.id).eq("local_event_id", String(event.id)).maybeSingle();
        if (existing) continue;
        const resource = googleEventBody(event, String(event.id));
        const created = await googleRequest(token, `/calendars/${encodeURIComponent(connection.write_calendar_id || "primary")}/events`, { method: "POST", body: JSON.stringify(resource) });
        const { error: linkError } = await service.from("google_calendar_event_links").insert({ user_id: user.id, local_event_id: String(event.id), google_calendar_id: connection.write_calendar_id || "primary", google_event_id: created.id });
        if (linkError) throw new HttpError(500, "google_event_link_save_failed");
        synced++;
      }
      return json({ synced, skipped: Math.max(0, events.length - synced) }, 200, origin);
    }

    throw new HttpError(400, "unknown_action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "google_calendar_request_failed";
    if (status >= 500) console.error("google calendar request failed", message, error);
    return json({ error: message }, status, origin);
  }
});
