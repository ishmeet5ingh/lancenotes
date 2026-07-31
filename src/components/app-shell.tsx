"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Lock, Loader2, LogOut, Plus, Users } from "lucide-react";
import { cn } from "@/lib/format";
import type { AuthUser } from "@/lib/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEditor = /^\/projects\/[^/]+$/.test(pathname);
  const isAdminRoute = pathname === "/users" || /^\/projects\/[^/]+\/edit$/.test(pathname);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { user?: AuthUser };
        return data.user ?? null;
      })
      .then((currentUser) => setUser(currentUser))
      .finally(() => setLoading(false));
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = (await response.json()) as { user?: AuthUser; error?: string };
    setLoggingIn(false);

    if (!response.ok || !data.user) {
      setLoginError(data.error ?? "Unable to sign in");
      return;
    }

    setUser(data.user);
    setPassword("");
  }

  async function logout() {
    if (!confirm("Are you sure you want to logout?")) return;
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setUsername("");
    setPassword("");
  }

  return (
    <div className="min-h-screen subtle-grid">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/projects" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-ink text-white shadow-sm">
              <FileText size={18} />
            </span>
            <span className="block text-sm font-black text-ink">Notes</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 sm:inline-flex">
                {user.displayName}
              </span>
              {user.role === "admin" ? (
                <Link href="/users" className="btn-secondary px-3" title="Users">
                  <Users size={16} />
                  <span className="hidden sm:inline">Users</span>
                </Link>
              ) : null}
              <Link href="/projects/new" className="btn-primary px-3" title="New">
                <Plus size={16} />
                <span>New</span>
              </Link>
              <button type="button" onClick={() => void logout()} className="btn-secondary px-3" title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full",
          isEditor ? "h-[calc(100vh-57px)] px-0 py-0" : "max-w-7xl px-4 py-5 sm:px-6 lg:px-8"
        )}
      >
        {loading ? (
          <div className="grid min-h-[70vh] place-items-center">
            <Loader2 className="animate-spin text-slate-400" size={28} />
          </div>
        ) : user && user.role !== "admin" && isAdminRoute ? (
          <div className="grid min-h-[70vh] place-items-center text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-md bg-slate-100 text-slate-500">
                <Lock size={20} />
              </span>
              <h1 className="mt-4 text-xl font-black text-ink">Admin only</h1>
              <Link href="/projects" className="mt-5 inline-flex text-sm font-bold text-brand">
                Back to notes
              </Link>
            </div>
          </div>
        ) : user ? (
          children
        ) : (
          <div className="mx-auto grid min-h-[70vh] max-w-sm place-items-center">
            <form onSubmit={login} className="surface w-full p-5">
              <h1 className="text-2xl font-black tracking-tight text-ink">Login</h1>
              <label className="mt-6 block space-y-2">
                <span className="label">User ID</span>
                <input
                  autoFocus
                  className="field"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="mt-3 block space-y-2">
                <span className="label">Password</span>
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {loginError ? <p className="mt-4 text-sm font-semibold text-rose-600">{loginError}</p> : null}
              <button className="btn-primary mt-5 w-full" disabled={loggingIn}>
                {loggingIn ? <Loader2 className="animate-spin" size={16} /> : null}
                Login
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
