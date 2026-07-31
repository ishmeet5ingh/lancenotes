"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, EyeOff, FileText, KeyRound, Lock, Loader2, LogOut, Plus, Users, X } from "lucide-react";
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
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = (await response.json().catch(() => ({ error: "Unable to sign in" }))) as { user?: AuthUser; error?: string };

      if (!response.ok || !data.user) {
        setLoginError(data.error ?? "Unable to sign in");
        return;
      }

      setUser(data.user);
      setPassword("");
    } catch {
      setLoginError("Unable to sign in");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    if (!confirm("Are you sure you want to logout?")) return;
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setUsername("");
    setPassword("");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    setPasswordSaving(true);
    const response = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = (await response.json().catch(() => ({ error: "Unable to change password" }))) as { error?: string };
    setPasswordSaving(false);

    if (!response.ok) {
      setPasswordError(data.error ?? "Unable to change password");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModalOpen(false);
    alert("Password changed.");
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
              <button type="button" onClick={() => setPasswordModalOpen(true)} className="btn-secondary px-3" title="Change password">
                <KeyRound size={16} />
              </button>
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
                <PasswordField value={password} onChange={setPassword} autoComplete="current-password" show={showLoginPassword} onToggle={() => setShowLoginPassword((current) => !current)} required />
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
      {user && passwordModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4">
          <form onSubmit={changePassword} className="w-full max-w-sm rounded-md border border-line bg-white p-4 shadow-lift">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <h2 className="text-lg font-black text-ink">Change password</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{user.displayName}</p>
              </div>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                onClick={() => {
                  setPasswordModalOpen(false);
                  setPasswordError("");
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-4 block space-y-2">
              <span className="label">Current password</span>
              <PasswordField value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" show={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} required />
            </label>
            <label className="mt-3 block space-y-2">
              <span className="label">New password</span>
              <PasswordField value={newPassword} onChange={setNewPassword} autoComplete="new-password" show={showNewPassword} onToggle={() => setShowNewPassword((current) => !current)} required />
            </label>
            <label className="mt-3 block space-y-2">
              <span className="label">Confirm new password</span>
              <PasswordField value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" show={showConfirmPassword} onToggle={() => setShowConfirmPassword((current) => !current)} required />
            </label>
            {passwordError ? <p className="mt-3 text-sm font-semibold text-rose-600">{passwordError}</p> : null}
            <button className="btn-primary mt-4 w-full" disabled={passwordSaving}>
              {passwordSaving ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              Save password
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  required = false
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <span className="relative block">
      <input
        className="field pr-10"
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-ink"
        title={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}
