import { useState } from "react";
import { supabase } from "./services/supabase";

const FUNDO = `${import.meta.env.BASE_URL}bg.png`;

function traduzirErro(erro) {
  switch (erro?.code) {
    case "invalid_credentials":
      return "Email ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu email antes de entrar (veja a caixa de entrada e o spam).";
    case "user_already_exists":
      return "Esse email já tem conta. Tente entrar.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 6 caracteres.";
    case "same_password":
      return "Use uma senha diferente da anterior.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas. Espere um pouco e tente de novo.";
    case "signup_disabled":
      return "O cadastro está desativado neste projeto.";
    default:
      return "Algo deu errado. Confira a conexão e tente de novo.";
  }
}

function Moldura({ children, onSubmit }) {
  return (
    <div className="ck-login">
      <div className="ck-login-fundo" style={{ backgroundImage: `url(${FUNDO})` }} aria-hidden="true" />
      <form className="ck-login-card" onSubmit={onSubmit}>
        {children}
      </form>
    </div>
  );
}

export default function Login() {
  const [modo, setModo] = useState("entrar"); // "entrar" | "criar" | "esqueci"
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");

  function trocarModo(novo) {
    setModo(novo);
    setErro("");
    setInfo("");
  }

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setInfo("");
    setCarregando(true);
    try {
      const emailLimpo = email.trim();
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: senha });
        if (error) throw error;
        // sucesso: o App percebe a sessão sozinho (onAuthStateChange)
      } else if (modo === "criar") {
        const { data, error } = await supabase.auth.signUp({ email: emailLimpo, password: senha });
        if (error) throw error;
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setErro("Esse email já tem conta. Tente entrar.");
        } else if (!data.session) {
          // confirmação de email ligada: a conta só vale depois do clique no link
          setInfo(`Enviamos um link de confirmação para ${emailLimpo}. Depois de confirmar, é só entrar.`);
          setModo("entrar");
          setSenha("");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        });
        if (error) throw error;
        setInfo(`Se existir uma conta com ${emailLimpo}, enviamos um link para criar uma nova senha.`);
      }
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setCarregando(false);
    }
  }

  const titulos = {
    entrar: "Entre para ver suas tarefas",
    criar: "Crie sua conta",
    esqueci: "Informe seu email para receber o link de nova senha",
  };
  const rotulosBotao = { entrar: "Entrar", criar: "Criar conta", esqueci: "Enviar link" };

  return (
    <Moldura onSubmit={enviar}>
      <h1>Tarefas</h1>
      <p className="ck-login-sub">{titulos[modo]}</p>

      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </label>

      {modo !== "esqueci" && (
        <label>
          Senha
          <input
            type="password"
            autoComplete={modo === "criar" ? "new-password" : "current-password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={6}
            required
          />
        </label>
      )}

      {erro && <p className="ck-login-erro" role="alert">{erro}</p>}
      {info && <p className="ck-login-info" role="status">{info}</p>}

      <button type="submit" className="ck-login-btn" disabled={carregando}>
        {carregando ? "Aguarde…" : rotulosBotao[modo]}
      </button>

      {modo === "entrar" && (
        <button type="button" className="ck-link" onClick={() => trocarModo("esqueci")}>
          Esqueci minha senha
        </button>
      )}
      <button type="button" className="ck-link" onClick={() => trocarModo(modo === "criar" ? "entrar" : modo === "esqueci" ? "entrar" : "criar")}>
        {modo === "entrar" ? "Criar uma conta" : modo === "criar" ? "Já tenho conta" : "Voltar para o login"}
      </button>
    </Moldura>
  );
}

// Tela mostrada depois que a pessoa clica no link do email de "esqueci a senha"
export function NovaSenha({ onConcluir }) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    if (senha !== confirmar) {
      setErro("As senhas não são iguais.");
      return;
    }
    setCarregando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      onConcluir();
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Moldura onSubmit={enviar}>
      <h1>Nova senha</h1>
      <p className="ck-login-sub">Escolha a nova senha da sua conta</p>

      <label>
        Nova senha
        <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required autoFocus />
      </label>
      <label>
        Repita a senha
        <input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} minLength={6} required />
      </label>

      {erro && <p className="ck-login-erro" role="alert">{erro}</p>}

      <button type="submit" className="ck-login-btn" disabled={carregando}>
        {carregando ? "Aguarde…" : "Salvar nova senha"}
      </button>
      <button type="button" className="ck-link" onClick={() => supabase.auth.signOut()}>
        Cancelar
      </button>
    </Moldura>
  );
}
