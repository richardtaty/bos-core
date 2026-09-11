import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext";

/* Imagen de marca del acceso. Vive en frontend/public/login-bg.jpg,
   Vite la copia tal cual a dist/ y el backend la sirve en la raíz. */
const LOGIN_BG = "/login-bg.jpg";

/* Campos del formulario: cristal oscuro sobre la imagen, con acento dorado
   (el mismo dorado del aro de "BOS" en la imagen de fondo). */
const CAMPO =
  "w-full rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2.5 text-sm text-white " +
  "placeholder:text-white/30 caret-amber-400 transition outline-none " +
  "focus:border-amber-400/70 focus:bg-white/10 focus:ring-2 focus:ring-amber-400/25";

const ETIQUETA = "mb-1.5 block text-xs font-medium text-white/60";

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
    /* [color-scheme:dark] para que los controles nativos (autocompletado,
       cursor, spinner) se dibujen en oscuro y no rompan el diseño. */
    <div className="relative flex min-h-[100svh] flex-col bg-black [color-scheme:dark]">
      {/*
        ── Móvil y tablet: la imagen completa arriba, sin recortes ──
        La caja conserva la proporción real del archivo (1536×1024 = 3:2), así el
        logotipo y las dos figuras entran enteros. Si la pantalla es muy baja
        (tablet en horizontal), el tope `max-h` recorta SOLO por abajo gracias a
        `object-top`, nunca el logotipo, que vive en el 30 % superior.
      */}
      <div className="relative w-full lg:hidden">
        <img
          src={LOGIN_BG}
          alt=""
          aria-hidden="true"
          className="pointer-events-none aspect-[3/2] max-h-[46svh] w-full select-none object-cover object-top"
        />
        {/* Funde la base de la imagen con el negro de la página */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-black" />
      </div>

      {/*
        ── Escritorio: la imagen a pantalla completa ──
        `object-[50%_10%]` la ancla arriba para que el logotipo quede completo en
        cualquier proporción de monitor; el recorte sobrante se va por abajo, que
        es la zona vacía. El formulario se centra debajo del logotipo.
      */}
      <img
        src={LOGIN_BG}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full select-none object-cover object-[50%_10%] lg:block"
      />

      {/* ── Formulario ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-10 pt-8 lg:px-8 lg:pb-12 lg:pt-[40vh] 2xl:pt-[44vh]">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-[380px] rounded-2xl border border-white/10 bg-black/55 p-7 shadow-2xl shadow-black/70 backdrop-blur-xl sm:p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-lg shadow-amber-500/25" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Taty's Enterprises LLC</p>
              <p className="text-xs text-white/50">Business Operating System</p>
            </div>
          </div>

          <label htmlFor="login-email" className={ETIQUETA}>
            Email
          </label>
          <input
            id="login-email"
            className={`${CAMPO} mb-4`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />

          <label htmlFor="login-password" className={ETIQUETA}>
            Contraseña
          </label>
          <input
            id="login-password"
            className={`${CAMPO} mb-4`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />

          {error && <p className="mb-3 text-xs text-red-300">{error}</p>}

          <button
            disabled={cargando}
            className="w-full rounded-lg bg-gradient-to-r from-amber-300 to-amber-500 py-2.5 text-sm font-semibold text-black shadow-lg shadow-amber-500/25 transition-all hover:from-amber-200 hover:to-amber-400 hover:shadow-amber-500/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {cargando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
