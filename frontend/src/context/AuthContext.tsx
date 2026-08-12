import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, getToken } from "@/src/api";

export type User = {
  user_id: string;
  name: string;
  email: string;
  stream: string;
  language: string;
  daily_goal: number;
  xp: number;
  picture?: string;
  role: string;
  status: string;
  exam_date?: string | null;
  current_streak?: number;
  longest_streak?: number;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  register: (name: string, email: string, password: string, stream: string, role: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUserState(me);
    } catch {
      await setToken(null);
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) await loadMe();
      setLoading(false);
    })();
  }, [loadMe]);

  const register = useCallback(async (name: string, email: string, password: string, stream: string, role: string) => {
    const res = await api<{ session_token: string; user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { name, email, password, stream, role },
    });
    await setToken(res.session_token);
    setUserState(res.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ session_token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await setToken(res.session_token);
    setUserState(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await setToken(null);
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, register, login, logout, refresh: loadMe, setUser: setUserState }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
