// Edge Function: envia os lembretes push do checklist.
// O pg_cron chama esta função a cada minuto; ela decide quem deve receber o quê.
//
// Segredos necessários (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com), CRON_SECRET
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos dentro das Edge Functions.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const MARCAS = ["", "🟢 ", "🟡 ", "🔴 "]; // mesma ordem de PRIORIDADES do App.jsx
const z2 = (n: number) => String(n).padStart(2, "0");

// "Agora" no relógio do usuário (o servidor roda em UTC)
function agoraNoFuso(fuso: string) {
  let partes;
  try {
    partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
  } catch {
    return agoraNoFuso("America/Sao_Paulo");
  }
  const g = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const [ano, mes, dia, h, mi] = [g("year"), g("month"), g("day"), g("hour"), g("minute")];
  return {
    hoje: `${ano}-${z2(mes)}-${z2(dia)}`,
    h, mi,
    hm: `${z2(h)}:${z2(mi)}`,
    minutosDia: h * 60 + mi,
    naive: Date.UTC(ano, mes - 1, dia, h, mi), // relógio local tratado como UTC, só pra comparar
  };
}

function somarDias(dataISO: string, n: number) {
  const [a, m, d] = dataISO.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${z2(x.getUTCMonth() + 1)}-${z2(x.getUTCDate())}`;
}

function horarioPermiteAvisos(janela: any, minutosDia: number) {
  if (!janela || janela.ativa !== true) return true;
  const valido = (valor: unknown) => typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
  if (!valido(janela.inicio) || !valido(janela.fim)) return true;
  const emMinutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  const inicio = emMinutos(janela.inicio);
  const fim = emMinutos(janela.fim);
  if (inicio === fim) return true;
  return inicio < fim
    ? minutosDia >= inicio && minutosDia < fim
    : minutosDia >= inicio || minutosDia < fim;
}

const naiveDe = (data: string, hora: string) => {
  const [a, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return Date.UTC(a, m - 1, d, h, mi);
};

// espelha rotuloPrazo() do App.jsx
function rotuloPrazo(t: any, ag: ReturnType<typeof agoraNoFuso>) {
  if (!t.limite) return null;
  const dia = t.limite === ag.hoje ? "hoje"
    : t.limite === somarDias(ag.hoje, 1) ? "amanhã"
    : t.limite.split("-").reverse().slice(0, 2).join("/");
  const fim = naiveDe(t.limite, t.limiteHora || "23:59");
  return { texto: `até ${dia}${t.limiteHora ? ` ${t.limiteHora}` : ""}`, atrasada: !t.feita && fim < ag.naive };
}

// espelha enviarNotificacao() do App.jsx
function montarResumo(dados: any, ag: ReturnType<typeof agoraNoFuso>) {
  const pendentes = (dados.tarefas ?? []).filter((t: any) => !t.feita && (!t.agendadaPara || t.agendadaPara <= ag.hoje));
  const eventos = (dados.eventos ?? [])
    .filter((e: any) => e.data === ag.hoje && (!e.hora || e.hora >= ag.hm))
    .sort((a: any, b: any) => (a.hora || "").localeCompare(b.hora || ""));
  if (!pendentes.length && !eventos.length) return null;

  const nomeGrupo = new Map((dados.grupos ?? []).map((g: any) => [g.id, g.nome]));
  const peso = (t: any) => (rotuloPrazo(t, ag)?.atrasada ? 10 : 0) + (t.prioridade || 0);
  const linhas: string[] = [...pendentes]
    .sort((a: any, b: any) => peso(b) - peso(a))
    .map((t: any) => {
      const sessao = nomeGrupo.get(t.grupoId);
      const pz = rotuloPrazo(t, ag);
      return `• ${MARCAS[t.prioridade || 0]}${t.texto}${t.meio ? " (meio feita)" : ""}${
        pz ? ` — ${pz.atrasada ? "⚠ atrasada" : pz.texto}` : ""
      }${sessao ? ` · ${sessao}` : ""}`;
    });

  // o push aceita ~4 KB: corta listas muito grandes
  const MAX = 12;
  const mostradas = linhas.slice(0, MAX);
  if (linhas.length > MAX) mostradas.push(`… e mais ${linhas.length - MAX}`);

  if (eventos.length) {
    mostradas.push("Hoje na agenda:");
    eventos.slice(0, 6).forEach((e: any) =>
      mostradas.push(`  • ${e.hora ? e.hora + " " : ""}${e.titulo}${e.endereco ? ` (${e.endereco})` : ""}`)
    );
  }

  return {
    titulo: `Checklist · ${ag.hm}`,
    corpo: `${pendentes.length ? `Faltam ${pendentes.length}:\n` : ""}${mostradas.join("\n")}`.slice(0, 1800),
    tag: "checklist-pendentes", // a nova substitui a anterior
    renotify: true,
  };
}

async function enviar(sub: any, payload: unknown, opcoes: { TTL: number; urgency?: "high" | "normal" }) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      opcoes,
    );
    return true;
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      // aparelho não existe mais (app desinstalado, permissão removida...)
      await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    } else {
      console.error("falha no push", sub.id, err?.statusCode, err?.body ?? err?.message);
    }
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("não autorizado", { status: 401 });
  }
  const forcar = new URL(req.url).searchParams.get("forcar") === "1"; // teste: manda o resumo agora

  const { data: subs, error } = await supabase.from("push_subscriptions").select("*").eq("ativo", true);
  if (error) return new Response(error.message, { status: 500 });
  if (!subs?.length) return new Response("sem aparelhos", { status: 200 });

  const ids = [...new Set(subs.map((s) => s.user_id))];
  const { data: linhas } = await supabase.from("user_data").select("user_id, data").in("user_id", ids);
  const dadosDe = new Map((linhas ?? []).map((l) => [l.user_id, l.data ?? {}]));

  let enviados = 0;

  for (const sub of subs) {
    const dados: any = dadosDe.get(sub.user_id) ?? {};
    const ag = agoraNoFuso(sub.fuso || "America/Sao_Paulo");
    const dentroDoHorario = horarioPermiteAvisos(dados.janelaAvisos, ag.minutosDia);
    const mudancas: Record<string, unknown> = {};

    // 1) avisos perto do prazo: 45 min antes (lembrete) e 15 min antes (chamadão)
    const vistos: Record<string, number> = { ...(sub.prazos_enviados ?? {}) };
    let mudouVistos = false;
    for (const t of dados.tarefas ?? []) {
      if (!forcar && !dentroDoHorario) break;
      if (t.agendadaPara && t.agendadaPara > ag.hoje) continue;
      if (t.feita || !t.limite || !t.limiteHora) continue;
      const faltam = (naiveDe(t.limite, t.limiteHora) - ag.naive) / 60000;
      for (const [marca, grande] of [[45, false], [15, true]] as const) {
        const chave = `${t.id}|${t.limite} ${t.limiteHora}|${marca}`;
        // só vale nos 5 minutos seguintes à marca, para não mandar aviso velho
        if (vistos[chave] || faltam > marca || faltam <= marca - 5) continue;
        const min = Math.ceil(faltam);
        const quando = t.limite === ag.hoje ? "" : ` de ${t.limite.split("-").reverse().slice(0, 2).join("/")}`;
        const ok = await enviar(sub, {
          titulo: grande ? `🚨 FALTAM ${min} MIN! · ${ag.hm}` : `⏰ Prazo chegando · ${ag.hm}`,
          corpo: `${MARCAS[t.prioridade || 0]}${t.texto}\nPrazo às ${t.limiteHora}${quando} · faltam ${min} min`,
          tag: `prazo-${t.id}-${marca}`,
          renotify: true,
          requireInteraction: grande,
          vibrate: grande ? [300, 150, 300, 150, 600] : undefined,
        }, { TTL: 600, urgency: "high" });
        if (ok) {
          vistos[chave] = Date.now();
          mudouVistos = true;
          enviados++;
        }
      }
    }
    if (mudouVistos) {
      const corte = Date.now() - 2 * 24 * 3600 * 1000;
      for (const k of Object.keys(vistos)) if (vistos[k] < corte) delete vistos[k];
      mudancas.prazos_enviados = vistos;
    }

    // 2) resumo periódico, em horários redondos do relógio do usuário
    const intervalo = sub.intervalo || 30;
    const ini = Math.floor(ag.minutosDia / intervalo) * intervalo;
    const slot = `${ag.hoje} ${z2(Math.floor(ini / 60))}:${z2(ini % 60)}`;
    if (forcar || sub.ultimo_slot !== slot) {
      if (!forcar) mudancas.ultimo_slot = slot;
      // só avisa nos primeiros 5 min do intervalo, para não mandar aviso velho
      if ((forcar || dentroDoHorario) && (forcar || ag.minutosDia % intervalo < 5)) {
        const resumo = montarResumo(dados, ag);
        if (resumo && (await enviar(sub, resumo, { TTL: 1200, urgency: "high" }))) enviados++;
      }
    }

    if (Object.keys(mudancas).length) {
      await supabase.from("push_subscriptions").update(mudancas).eq("id", sub.id);
    }
  }

  return new Response(JSON.stringify({ aparelhos: subs.length, enviados }), {
    headers: { "Content-Type": "application/json" },
  });
});
