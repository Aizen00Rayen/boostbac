import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, setToken, getToken } from "@/src/api";

WebBrowser.maybeCompleteAuthSession();

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
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const processedIds = useRef<Set<string>>(new Set());

  const loadMe = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUserState(me);
    } catch {
      await setToken(null);
      setUserState(null);
    }
  }, []);

  const handleSessionId = useCallback(async (sessionId: string) => {
    if (processedIds.current.has(sessionId)) return;
    processedIds.current.add(sessionId);
    const res = await api<{ session_token: string; user: User }>("/auth/session", {
      method: "POST",
      auth: false,
      body: { session_id: sessionId },
    });
    await setToken(res.session_token);
    setUserState(res.user);
  }, []);

  useEffect(() => {
    (async () => {
      // web callback parse
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash || "";
        const search = window.location.search || "";
        const m = (hash + search).match(/session_id=([^&#]+)/);
        if (m) {
          try {
            await handleSessionId(decodeURIComponent(m[1]));
            window.history.replaceState(window.history.state, "", window.location.pathname);
          } catch {}
          setLoading(false);
          return;
        }
      } else {
        const initial = await Linking.getInitialURL();
        if (initial) {
          const m = initial.match(/session_id=([^&#]+)/);
          if (m) {
            try {
              await handleSessionId(decodeURIComponent(m[1]));
            } catch {}
          }
        }
      }
      const token = await getToken();
      if (token) await loadMe();
      setLoading(false);
    })();

    const sub = Linking.addEventListener("url", async ({ url }) => {
      const m = url.match(/session_id=([^&#]+)/);
      if (m) {
        try {
          await handleSessionId(decodeURIComponent(m[1]));
        } catch {}
      }
    });
    return () => sub.remove();
  }, [handleSessionId, loadMe]);

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

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.origin + "/"
        : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    if (result.type === "success" && (result as any).url) url = (result as any).url;
    if (!url) url = await Linking.getInitialURL();
    if (url) {
      const m = url.match(/session_id=([^&#]+)/);
      if (m) await handleSessionId(decodeURIComponent(m[1]));
    }
  }, [handleSessionId]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await setToken(null);
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, register, login, loginWithGoogle, logout, refresh: loadMe, setUser: setUserState }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
