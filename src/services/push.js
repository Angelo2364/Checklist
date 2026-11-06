import { supabase } from "./supabase";

// Chave pública VAPID (a privada fica só no servidor, nos segredos da Edge Function)
const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const pushSuportado = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window &&
  !!CHAVE_PUBLICA;

function chaveParaBytes(base64) {
  const preenchida = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchida);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

async function registro() {
  const reg =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
  await navigator.serviceWorker.ready;
  return reg;
}

const fusoDoUsuario = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

// mesmo formato do App.jsx: "2026-11-05 21:30" (começo do intervalo atual)
function slotAtual(intervalo) {
  const a = new Date();
  const z2 = (n) => String(n).padStart(2, "0");
  const total = a.getHours() * 60 + a.getMinutes();
  const ini = Math.floor(total / intervalo) * intervalo;
  return `${a.getFullYear()}-${z2(a.getMonth() + 1)}-${z2(a.getDate())} ${z2(Math.floor(ini / 60))}:${z2(ini % 60)}`;
}

// Inscreve este aparelho e guarda a inscrição no Supabase.
// reiniciar = true: começa a contar a partir de agora (não manda aviso do intervalo em andamento).
export async function ativarPush(userId, intervalo, reiniciar = false) {
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(CHAVE_PUBLICA),
      });
    } catch (err) {
      // inscrição antiga feita com outra chave: limpa e tenta de novo
      const velha = await reg.pushManager.getSubscription();
      if (velha) await velha.unsubscribe();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(CHAVE_PUBLICA),
      });
    }
  }
  const j = sub.toJSON();
  const linha = {
    user_id: userId,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    intervalo,
    fuso: fusoDoUsuario(),
    ativo: true,
  };
  if (reiniciar) linha.ultimo_slot = slotAtual(intervalo);
  const { error } = await supabase.from("push_subscriptions").upsert(linha, { onConflict: "endpoint" });
  if (error) throw error;
}

// Troca o intervalo deste aparelho
export async function atualizarPush(intervalo) {
  const reg = await registro();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ intervalo, ultimo_slot: slotAtual(intervalo) })
    .eq("endpoint", sub.endpoint);
  if (error) throw error;
}

// Desliga os avisos deste aparelho (apaga a inscrição no servidor e no navegador)
export async function desativarPush() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
