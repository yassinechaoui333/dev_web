import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, type User } from "../../shared/api";
type Auth = {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setUser((await api<{ data: User }>("/auth/me")).data);
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    function expired() {
      setUser(null);
      setError("");
    }
    window.addEventListener("auth:expired", expired);
    void refresh();
    return () => window.removeEventListener("auth:expired", expired);
  }, []);
  return (
    <Context.Provider value={{ user, setUser, loading, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
