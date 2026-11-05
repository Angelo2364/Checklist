import { supabase } from "./supabase";

// Chamadas à tabela public.user_data (uma linha por usuário: { user_id, data, updated_at }).
// Todas respeitam o RLS: cada usuário só enxerga e altera a própria linha.

// Lê os dados do usuário. Retorna { data, updated_at } ou null se a conta ainda não tem linha.
export async function carregarDados(userId) {
  const { data, error } = await supabase
    .from("user_data")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Primeiro salvamento da conta (cria a linha). Retorna o updated_at gravado.
// Se outro aparelho criou a linha ao mesmo tempo, o erro tem code "23505".
export async function criarDados(userId, dados) {
  const { data, error } = await supabase
    .from("user_data")
    .insert({ user_id: userId, data: dados, updated_at: new Date().toISOString() })
    .select("updated_at")
    .single();
  if (error) throw error;
  return data.updated_at;
}

// Atualiza os dados. Se `esperado` vier preenchido, só grava quando a linha ainda está
// naquela versão (ninguém salvou depois). Retorna o novo updated_at, ou null se houve conflito.
// Passando esperado = null, grava por cima de qualquer coisa.
export async function salvarDados(userId, dados, esperado) {
  let consulta = supabase
    .from("user_data")
    .update({ data: dados, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (esperado) consulta = consulta.eq("updated_at", esperado);
  const { data, error } = await consulta.select("updated_at");
  if (error) throw error;
  return data.length ? data[0].updated_at : null;
}
