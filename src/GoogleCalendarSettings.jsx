import { useCallback, useEffect, useState } from "react";
import { supabase } from "./services/supabase";

async function chamarIntegracao(body) {
  const { data, error } = await supabase.functions.invoke("google-calendar", { body });
  if (data?.error) throw new Error(data.error);
  if (error) {
    let mensagem = "google_calendar_request_failed";
    if (error.context instanceof Response) {
      try { mensagem = (await error.context.json())?.error || mensagem; } catch { /* resposta sem JSON */ }
    }
    throw new Error(mensagem);
  }
  return data || {};
}

function textoErro(error) {
  const mensagens = {
    google_integration_not_configured: "A integração ainda precisa ser configurada no Google Cloud e no Supabase.",
    google_encryption_key_not_configured: "Falta configurar a chave segura de armazenamento no Supabase.",
    google_authorization_revoked_reconnect_required: "A autorização do Google expirou ou foi revogada. Conecte a conta novamente.",
    google_calendar_not_connected: "Conecte sua conta Google para continuar.",
    consent_denied: "A conexão foi cancelada no Google.",
    token_exchange_failed: "O Google não concluiu a autorização. Tente conectar novamente.",
    missing_refresh_token: "O Google não forneceu uma autorização duradoura. Tente conectar novamente e aceite as permissões.",
    google_revoke_failed: "Não consegui revogar o acesso no Google agora. A conexão continua salva para você tentar novamente.",
  };
  return mensagens[error?.message] || "Não consegui concluir a operação com o Google Calendar. Tente novamente.";
}

export default function GoogleCalendarSettings({ connected, onConnectedChange }) {
  const [calendars, setCalendars] = useState([]);
  const [selected, setSelected] = useState(["primary"]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const result = query.get("googleCalendar");
    if (!result) return;
    if (result === "connected") {
      setFeedback("Conta Google conectada. Agora escolha quais calendários quer ver no Crysalis.");
      onConnectedChange(true);
    } else {
      const reason = query.get("reason") || "";
      setError(textoErro(new Error(reason)));
    }
    query.delete("googleCalendar");
    query.delete("reason");
    const search = query.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }, [onConnectedChange]);

  const carregarCalendarios = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await chamarIntegracao({ action: "calendars" });
      setCalendars(result.calendars || []);
      setSelected(result.selectedCalendarIds || ["primary"]);
    } catch (reason) {
      setError(textoErro(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (connected) carregarCalendarios();
    else { setCalendars([]); setSelected(["primary"]); }
  }, [connected, carregarCalendarios]);

  async function conectar() {
    setBusy(true); setError(""); setFeedback("");
    try {
      const result = await chamarIntegracao({ action: "start", returnOrigin: window.location.origin });
      if (!result.authorizationUrl) throw new Error("google_calendar_request_failed");
      window.location.assign(result.authorizationUrl);
    } catch (reason) {
      setError(textoErro(reason)); setBusy(false);
    }
  }

  async function desconectar() {
    setBusy(true); setError(""); setFeedback("");
    try {
      await chamarIntegracao({ action: "disconnect" });
      onConnectedChange(false);
      setFeedback("Conta Google desconectada. Os eventos já existentes no Google foram mantidos.");
    } catch (reason) { setError(textoErro(reason)); }
    finally { setBusy(false); }
  }

  async function salvarCalendarios() {
    setBusy(true); setError(""); setFeedback("");
    try {
      await chamarIntegracao({ action: "select-calendars", calendarIds: selected });
      setFeedback("Calendários que aparecem no Crysalis atualizados.");
    } catch (reason) { setError(textoErro(reason)); }
    finally { setBusy(false); }
  }

  async function sincronizarExistentes() {
    setBusy(true); setError(""); setFeedback("");
    try {
      const result = await chamarIntegracao({ action: "sync-existing" });
      setFeedback(`${result.synced || 0} evento${result.synced === 1 ? "" : "s"} enviado${result.synced === 1 ? "" : "s"} ao calendário principal do Google.`);
    } catch (reason) { setError(textoErro(reason)); }
    finally { setBusy(false); }
  }

  function alternarCalendario(id) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return <section className="ck-pref-card ck-google-card">
    <h3>Google Calendar</h3>
    <p>Sincronize seus eventos do Crysalis e escolha calendários e feriados da sua conta Google para exibir aqui. Você pode editar eventos de calendários que possui; os demais ficam somente para leitura.</p>
    {connected ? <>
      <div className="ck-google-status"><span className="ck-google-status-dot" aria-hidden="true" />Conta conectada</div>
      <div className="ck-google-calendars">
        <strong>Calendários exibidos no Crysalis</strong>
        {calendars.length ? calendars.map((calendar) => <label className="ck-limite-horario" key={calendar.id}>
          <input type="checkbox" checked={selected.includes(calendar.id)} onChange={() => alternarCalendario(calendar.id)} />
          <span>{calendar.summary}{calendar.primary ? " (principal)" : ""}</span>
        </label>) : <small>{busy ? "Carregando calendários…" : "Nenhum calendário disponível."}</small>}
        <div className="ck-google-actions">
          <button type="button" className="secundario" onClick={salvarCalendarios} disabled={busy}>Salvar seleção</button>
          <button type="button" className="secundario" onClick={sincronizarExistentes} disabled={busy}>Enviar eventos existentes</button>
          <button type="button" className="secundario" onClick={desconectar} disabled={busy}>Desconectar</button>
        </div>
      </div>
    </> : <button type="button" onClick={conectar} disabled={busy}>{busy ? "Conectando…" : "Conectar conta Google"}</button>}
    <small>Eventos criados no Crysalis são gerenciados por ele no Google. <a href={`${import.meta.env.BASE_URL}privacidade.html`} target="_blank" rel="noreferrer">Política de privacidade</a></small>
    {feedback && <p className="ck-msg-dados" role="status">{feedback}</p>}
    {error && <p className="ck-erro" role="alert">{error}</p>}
  </section>;
}
