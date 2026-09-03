import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";

export function LoginPage() {
  const { login, usuario, cargando, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Si ya hay token completo, redirigir al dashboard
  if (usuario && localStorage.getItem("bos_token")) {
    if (usuario.rol === "SUPER_ADMIN") return <Navigate to="/ceo" replace />;
    return <Navigate to="/mi-dia" replace />;
  }

  // Si hay token temporal pendiente, redirigir a verificar PIN
  if (localStorage.getItem("bos_temp_token") && usuario) {
    return <Navigate to="/verificar-pin" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(email, password);
    if (localStorage.getItem("bos_temp_token")) {
      navigate("/verificar-pin");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <form onSubmit={onSubmit} className="bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm  p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-secondary-700 shadow-lg shadow-primary-500/20" />
          <div>
            <p className="font-semibold text-sm text-neutral-900">Taty's Enterprises LLC</p>
            <p className="text-xs text-neutral-500">Business Operating System</p>
          </div>
        </div>

        <label className="block text-xs text-neutral-600 mb-1">Email</label>
        <input
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-4 bg-transparent text-neutral-800 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />

        <label className="block text-xs text-neutral-600 mb-1">Contraseña</label>
        <input
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-4 bg-transparent text-neutral-800 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

        <button
          disabled={cargando}
          className="w-full bg-primary-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-600 disabled:bg-primary-100 disabled:text-primary-800 shadow-lg shadow-primary-500/25 transition-all hover:shadow-primary-500/40"
        >
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
