import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, setToken, getToken } from "@/src/api";

export type User = {
  user_id: string;
  name: string;
  nickname?: string | null;
  email: string;
  stream: string;
  role: string;
  status: string;
  onboarded: boolean;
  study_time_pref?: string | null;
  goal?: string | null;
  pain_points?: string[];
  picture?: string;
  current_streak?: number;
  longest_streak?: number;
};

type OnboardingData = {
  nickname?: string;
  stream: string;
  study_time_pref: string;
  pain_points: string[];
  goal: string;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Monotonic guard against a stale auth check clobbering a newer one — e.g. the
  // mount-time "is there already a session?" probe below is still in flight when
  // the user explicitly logs in; without this, the probe's late (and possibly
  // failing) result can land after login() and silently log the user back out.
  // Every auth-mutating action bumps this counter and only applies its own result
  // if it's still the most recent action by the time it resolves.
  const authGen = useRef(0);

  const loadMe = useCallback(async () => {
    const gen = ++authGen.current;
    try {
      const me = await api<User>("/auth/me");
      if (authGen.current !== gen) return;
      setUserState(me);
    } catch {
      if (authGen.current !== gen) return;
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

  const register = useCallback(async (name: string, email: string, password: string) => {
    const gen = ++authGen.current;
    const res = await api<{ session_token: string; user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { name, email, password },
    });
    await setToken(res.session_token);
    if (authGen.current !== gen) return;
    setUserState(res.user);
  }, []);

  const completeOnboarding = useCallback(async (data: OnboardingData) => {
    const gen = ++authGen.current;
    const updated = await api<User>("/onboarding", { method: "POST", body: data });
    if (authGen.current !== gen) return;
    setUserState(updated);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const gen = ++authGen.current;
    const res = await api<{ session_token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await setToken(res.session_token);
    if (authGen.current !== gen) return;
    setUserState(res.user);
  }, []);

  const logout = useCallback(async () => {
    ++authGen.current;
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await setToken(null);
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, register, login, logout, refresh: loadMe, setUser: setUserState, completeOnboarding }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
