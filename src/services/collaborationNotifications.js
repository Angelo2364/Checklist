import { supabase } from "./supabase";

const DEBOUNCE_MS = 8_000;
let dispatchTimer;

// Changes made close together are merged by the database queue before delivery.
// The scheduled server job remains as a fallback if the page closes first.
export function scheduleCollaborationNotificationDispatch() {
  window.clearTimeout(dispatchTimer);
  dispatchTimer = window.setTimeout(() => {
    supabase.functions.invoke("enviar-lembretes", { body: { colaboracao: true } })
      .then(({ error }) => {
        if (error) console.warn("Não consegui acordar o envio das notificações compartilhadas:", error.message);
      })
      .catch((error) => console.warn("Não consegui acordar o envio das notificações compartilhadas:", error));
  }, DEBOUNCE_MS);
}
