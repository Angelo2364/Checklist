import { useState } from "react";
import { supabase } from "./services/supabase";
import logo from "/Logo.svg";

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
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");

  function trocarModo(novo) {
    setModo(novo);
    setErro("");
    setInfo("");
    if (novo === "criar") setNomeUsuario("");
  }

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setInfo("");
    const nomeUsuarioLimpo = nomeUsuario.trim().toLowerCase();
    if (modo === "criar" && !/^[a-z0-9_]{3,20}$/.test(nomeUsuarioLimpo)) {
      setErro("Use de 3 a 20 letras sem acento, números ou _.");
      return;
    }
    setCarregando(true);
    try {
      const emailLimpo = email.trim();
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: senha });
        if (error) throw error;
        // sucesso: o App percebe a sessão sozinho (onAuthStateChange)
      } else if (modo === "criar") {
        const { data, error } = await supabase.auth.signUp({
          email: emailLimpo,
          password: senha,
          options: { data: { username: nomeUsuarioLimpo } },
        });
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
        const redirectTo = import.meta.env.DEV
          ? new URL(import.meta.env.BASE_URL, window.location.origin).href
          : "https://www.crysalis.me/";
        const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
          redirectTo,
        });
        if (error) throw error;
        setInfo(`Se existir uma conta com ${emailLimpo}, enviamos um link para criar uma nova senha.`);
      }
    } catch (err) {
      setErro(modo === "criar" && (err?.code === "unexpected_failure" || err?.message?.includes("saving new user"))
        ? "Não foi possível criar a conta. Esse nome de usuário pode já estar em uso; tente outro."
        : traduzirErro(err));
    } finally {
      setCarregando(false);
    }
  }

  const titulos = {
    entrar: "Organize seus dias. Cresça no seu tempo.",
    criar: "Crie sua conta",
    esqueci: "Informe seu email para receber o link de nova senha",
  };
  const rotulosBotao = { entrar: "Entrar", criar: "Criar conta", esqueci: "Enviar link" };

  return (
    <Moldura onSubmit={enviar}>
 <img src={logo} alt="Logo do Crysalis" className="ck-login-logo" />

      <h1>Crysalis</h1>
      <p className="ck-login-sub">{titulos[modo]}</p>

      {modo === "criar" && (
        <label>
          Nome de usuário
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            value={nomeUsuario}
            onChange={(e) => setNomeUsuario(e.target.value)}
            minLength={3}
            maxLength={20}
            pattern="[A-Za-z0-9_]{3,20}"
            title="Use de 3 a 20 letras sem acento, números ou _."
            placeholder="seunome"
            required
          />
          <small className="ck-login-usuario-hint">3–20 caracteres: letras sem acento, números ou _.</small>
        </label>
      )}

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
