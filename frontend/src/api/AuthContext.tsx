import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { api } from "../api/client";
import type { Usuario } from "../types";

interface AuthContextValue {
  usuario: Usuario | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  cargando: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function usuarioGuardado(): Usuario | null {
  const raw = localStorage.getItem("bos_usuario");
  return raw ? (JSON.parse(raw) as Usuario) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioGuardado());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      const raw = res.usuario as any;

      // Si el backend pide PIN, guardar token temporal y redirigir
      if (res.requierePin && res.tempToken) {
        localStorage.setItem("bos_temp_token", res.tempToken);
        localStorage.setItem("bos_usuario", JSON.stringify({
          ...raw,
          departamentoIds: raw.departamentoIds ?? (raw.departamentoId ? [raw.departamentoId] : []),
        }));
        setUsuario({ ...raw, departamentoIds: raw.departamentoIds ?? (raw.departamentoId ? [raw.departamentoId] : []) } as Usuario);
        setCargando(false);
        return;
      }

      // Guardar device token para "recordar dispositivo"
      if (res.deviceToken) {
        localStorage.setItem("bos_device", res.deviceToken);
      }

      localStorage.setItem("bos_token", res.token!);
      localStorage.setItem("bos_usuario", JSON.stringify({
        ...raw,
        departamentoIds: raw.departamentoIds ?? (raw.departamentoId ? [raw.departamentoId] : []),
      }));
      setUsuario({ ...raw, departamentoIds: raw.departamentoIds ?? (raw.departamentoId ? [raw.departamentoId] : []) } as Usuario);
    } catch {
      setError("Credenciales inválidas");
    } finally {
      setCargando(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("bos_token");
    localStorage.removeItem("bos_usuario");
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, login, logout, cargando, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
