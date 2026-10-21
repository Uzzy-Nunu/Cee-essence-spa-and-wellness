"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { naira } from "@/lib/format";
import { encodeServiceMedia } from "@/lib/service-media";

const baseTabs = [
  "Overview",
  "Appointments",
  "Services",
  "Therapists",
  "Business Hours",
  "Blocked Dates",
  "Support Tickets",
  "Spa Settings",
] as const;

type Tab = typeof baseTabs[number] | "Admin Team";
type Row = Record<string, any>;

const tableFor: Record<string, string> = {
  Appointments: "appointments",
  Services: "services",
  Therapists: "therapists",
  "Business Hours": "business_hours",
  "Blocked Dates": "blocked_dates",
  "Support Tickets": "support_tickets",
  "Spa Settings": "spa_settings",
};

const DEFAULT_TREATMENT_CATEGORIES = [
  "Massage Treatments",
  "Facial Treatments",
  "Body Treatments",
  "Hand & Foot Treatments",
];

export default function Admin() {
  const [state, setState] = useState<"loading" | "login" | "denied" | "admin">("loading");
  const [tab, setTab] = useState<Tab>("Overview");
  const [rows, setRows] = useState<Row[]>([]);
  const [services, setServices] = useState<Row[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [db, setDb] = useState<ReturnType<typeof supabase> | null>(null);

  // Staff Identity & Authorization Role
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<"super_admin" | "admin">("super_admin");
  const [sessionToken, setSessionToken] = useState("");

  const isSuperAdmin = currentUserRole === "super_admin";
  const visibleTabs: Tab[] = isSuperAdmin ? [...baseTabs, "Admin Team"] : [...baseTabs];

  useEffect(() => {
    setDb(supabase());
  }, []);

  const load = useCallback(async (name: Tab = tab) => {
    if (!db) return;
    setError("");
    setLoading(true);
    try {
      if (name === "Admin Team") {
        setLoading(false);
        return;
      }

      if (name === "Overview") {
        const [appointments, serviceRows, therapistRows, ticketRows] = await Promise.all([
          db.from("appointments").select("id,status,created_at"),
          db.from("services").select("id,is_active"),
          db.from("therapists").select("id,is_active"),
          db.from("support_tickets").select("id,status,created_at"),
        ]);
        const queryError = appointments.error || serviceRows.error || therapistRows.error || ticketRows.error;
        if (queryError) throw queryError;
        setRows([
          {
            title: "Appointments",
            value: appointments.data.length,
            sub: `${appointments.data.filter((row) => row.status === "pending").length} pending confirmation`,
          },
          {
            title: "Active services",
            value: serviceRows.data.filter((row) => row.is_active).length,
            sub: "Visible to clients",
          },
          {
            title: "Active therapists",
            value: therapistRows.data.filter((row) => row.is_active).length,
            sub: "Available to book",
          },
          {
            title: "Open tickets",
            value: ticketRows.data.filter((row) => row.status !== "resolved").length,
            sub: "Need a response",
          },
        ]);
        setLastRefreshed(new Date().toLocaleTimeString());
        return;
      }

      const table = tableFor[name];
      if (!table) return;

      let query = db.from(table).select(
        name === "Appointments"
          ? "*,services(name,category),therapists(full_name)"
          : name === "Therapists"
            ? "*,therapist_services(service_id,services(name)),therapist_time_off(id,off_date)"
            : "*",
      );

      if (name === "Appointments") {
        query = query.order("appointment_date", { ascending: false }).order("start_time", { ascending: false });
      } else if (name === "Services") {
        query = query.order("category").order("price");
      } else if (name === "Support Tickets") {
        query = query.order("created_at", { ascending: false });
      } else if (name === "Blocked Dates") {
        query = query.order("blocked_date", { ascending: true });
      } else if (name === "Business Hours") {
        query = query.order("weekday", { ascending: true });
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setRows(data || []);

      if (name === "Therapists") {
        const { data: serviceData, error: serviceError } = await db.from("services").select("id,name,category").order("name");
        if (serviceError) throw serviceError;
        setServices(serviceData || []);
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (loadError) {
      console.error("Admin data load failed", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load this section.");
    } finally {
      setLoading(false);
    }
  }, [db, tab]);

  // Auth verification & role resolution
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        if (!db) return;
        const { data: { user }, error: authError } = await db.auth.getUser();
        if (!mounted) return;
        if (authError) throw authError;
        if (!user) {
          setState("login");
          return;
        }

        const { data: { session } } = await db.auth.getSession();
        if (session?.access_token) {
          setSessionToken(session.access_token);
        }

        if (!session?.access_token) {
          setState("denied");
          return;
        }
        const response = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!mounted) return;
        if (response.status === 403) {
          setState("denied");
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to verify staff role.");
        setCurrentUserEmail(result.current_user.email || user.email || "Staff User");
        setCurrentUserRole(result.current_user.role === "super_admin" ? "super_admin" : "admin");
        setState("admin");
      } catch (authError) {
        console.error("Admin authorization check failed", authError);
        if (mounted) {
          setError(authError instanceof Error ? authError.message : "Unable to verify staff access. Please try signing in again.");
          setState("login");
        }
      }
    })();
    return () => { mounted = false; };
  }, [db]);

  // Load active tab data
  useEffect(() => {
    if (state === "admin") void load();
  }, [state, tab, load]);

  // Supabase Real-time Subscriptions
  useEffect(() => {
    if (state !== "admin" || !db) return;

    const channel = db
      .channel("admin-realtime-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "business_hours" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_dates" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      void db.removeChannel(channel);
    };
  }, [state, db, load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!db) return;
    setError("");
    const { error: loginError } = await db.auth.signInWithPassword({ email, password });
    if (loginError) setError(loginError.message);
    else location.reload();
  }

  async function save(table: string, id: string, values: Row) {
    if (!db) return;
    setError("");

    // RBAC: Regular Admins can ONLY resolve/update support tickets
    if (!isSuperAdmin && table !== "support_tickets") {
      setError("Regular Admins have view-only access for this section. Only Super Admins can save changes.");
      return;
    }

    try {
      if (table === "appointments" && typeof values.status === "string") {
        const { data: { session }, error: sessionError } = await db.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) throw new Error("Your staff session has expired. Please sign in again.");
        const response = await fetch(`/api/admin/appointments/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(values),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to update appointment.");
        await load();
        return;
      }
      const { error: updateError } = await db.from(table).update(values).eq("id", id);
      if (updateError) throw updateError;
      await load();
    } catch (saveError) {
      console.error("Admin record update failed", saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to save changes.");
    }
  }

  async function remove(table: string, id: string) {
    if (!isSuperAdmin) {
      setError("Regular Admins have view-only access. Only Super Admins can remove items.");
      return;
    }

    if (!confirm("Remove this record?")) return;
    if (!db) return;
    setError("");
    const { error: removeError } = await db.from(table).delete().eq("id", id);
    if (removeError) setError(removeError.message);
    else await load();
  }

  if (!db || state === "loading") return <main className="admin-shell"><p>Checking secure access…</p></main>;
  if (state === "denied") {
    return (
      <main className="admin-shell">
        <h1>Access restricted</h1>
        <p>You are signed in, but your account has not been added to the authorized admin list.</p>
        <button className="button" onClick={async () => { await db.auth.signOut(); setState("login"); }}>
          Sign out
        </button>
      </main>
    );
  }

  if (state === "login") {
    return (
      <main className="admin-shell">
        <form onSubmit={login}>
          <span className="eyebrow">CEE ESSENCE · STAFF</span>
          <h1>Welcome back.</h1>
          <input
            required
            type="email"
            autoComplete="username"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            required
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button" disabled={loading}>Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside>
        <div className="wordmark">
          CEE ESSENCE<small>SPA &amp; WELLNESS · ADMIN</small>
        </div>

        <div className="admin-profile-badge">
          <span className="admin-profile-email">{currentUserEmail}</span>
          <span className={`admin-role-pill ${isSuperAdmin ? "super" : "regular"}`}>
            {isSuperAdmin ? "👑 Super Admin" : "👤 Regular Admin (View Only)"}
          </span>
        </div>

        {visibleTabs.map((item) => (
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>
            {item}
          </button>
        ))}
        <button className="signout" onClick={async () => { await db.auth.signOut(); location.reload(); }}>
          Sign out
        </button>
      </aside>
      <section className="admin-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span className="eyebrow">OPERATIONS · REALTIME SYNC ACTIVE</span>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {lastRefreshed && <small style={{ color: "#63594d" }}>Synced: {lastRefreshed}</small>}
            <button
              onClick={() => void load()}
              style={{
                background: "transparent",
                border: "1px solid var(--olive)",
                padding: "6px 12px",
                fontSize: "10px",
                cursor: "pointer",
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        <h1>{tab}</h1>

        {/* Regular Admin view-only banner */}
        {!isSuperAdmin && tab !== "Support Tickets" && tab !== "Overview" && (
          <div className="admin-view-only-banner">
            <span>🔒 Regular Admin Mode (View Only)</span>
            <small>You have view-only access for this section. You have authority to resolve guest support tickets in the Support Tickets tab.</small>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {loading ? (
          <p>Loading data…</p>
        ) : (
          <Content
            tab={tab}
            rows={rows}
            services={services}
            db={db}
            refresh={() => load()}
            save={save}
            remove={remove}
            customCategories={customCategories}
            setCustomCategories={setCustomCategories}
            isSuperAdmin={isSuperAdmin}
            sessionToken={sessionToken}
          />
        )}
      </section>
    </main>
  );
}

function Content({
  tab,
  rows,
  services,
  db,
  refresh,
  save,
  remove,
  customCategories,
  setCustomCategories,
  isSuperAdmin,
  sessionToken,
}: {
  tab: Tab;
  rows: Row[];
  services: Row[];
  db: any;
  refresh: () => void;
  save: (table: string, id: string, values: Row) => Promise<void>;
  remove: (table: string, id: string) => Promise<void>;
  customCategories: string[];
  setCustomCategories: React.Dispatch<React.SetStateAction<string[]>>;
  isSuperAdmin: boolean;
  sessionToken: string;
}) {
  if (tab === "Admin Team") {
    return <AdminTeamTab isSuperAdmin={isSuperAdmin} sessionToken={sessionToken} />;
  }

  if (tab === "Overview") {
    return (
      <div className="metrics">
        {rows.map((row) => (
          <article key={row.title}>
            <span>{row.title}</span>
            <strong>{row.value}</strong>
            <small>{row.sub}</small>
          </article>
        ))}
      </div>
    );
  }

  if (tab === "Services") {
    const allCategories = [...DEFAULT_TREATMENT_CATEGORIES, ...customCategories];
    return (
      <ServiceTab
        db={db}
        rows={rows}
        refresh={refresh}
        save={save}
        remove={remove}
        allCategories={allCategories}
        customCategories={customCategories}
        setCustomCategories={setCustomCategories}
        isSuperAdmin={isSuperAdmin}
      />
    );
  }

  if (tab === "Therapists") {
    return (
      <>
        {isSuperAdmin && <CreateTherapist db={db} done={refresh} />}
        <div className="data-list">
          {rows.map((row) => (
            <Therapist
              key={row.id}
              row={row}
              services={services}
              db={db}
              done={refresh}
              save={save}
              remove={remove}
              isSuperAdmin={isSuperAdmin}
            />
          ))}
        </div>
      </>
    );
  }

  if (tab === "Business Hours") {
    return (
      <div className="data-list">
        {rows.map((row) => (
          <BusinessHour key={row.id} row={row} save={save} isSuperAdmin={isSuperAdmin} />
        ))}
      </div>
    );
  }

  if (tab === "Blocked Dates") {
    return (
      <>
        {isSuperAdmin && <CreateBlocked db={db} done={refresh} />}
        <div className="data-list">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <b>{row.blocked_date}</b>
                <p>{row.reason || "Spa closed / Public holiday"}</p>
              </div>
              {isSuperAdmin && (
                <button onClick={() => void remove("blocked_dates", row.id)}>Remove</button>
              )}
            </article>
          ))}
        </div>
      </>
    );
  }

  if (tab === "Appointments") {
    return (
      <div className="data-list">
        {rows.length === 0 ? (
          <p>No appointments recorded yet.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id}>
              <div>
                <b>{row.full_name} · {row.services?.name}</b>
                {row.services?.category && (
                  <span
                    style={{
                      marginLeft: "8px",
                      padding: "2px 6px",
                      fontSize: "9px",
                      background: "#e9dfcf",
                    }}
                  >
                    {row.services.category}
                  </span>
                )}
                <p>
                  Date: <strong>{row.appointment_date}</strong> at <strong>{row.start_time?.slice(0, 5)}</strong> · Therapist: {row.therapists?.full_name || "Unassigned"}
                </p>
                <small>
                  {row.email} · {row.phone}
                  {row.notes ? ` · Note: "${row.notes}"` : ""}
                </small>
              </div>
              <select
                disabled={!isSuperAdmin}
                value={row.status}
                aria-label={`Status for ${row.full_name}`}
                onChange={(event) => void save("appointments", row.id, { status: event.target.value })}
              >
                {["pending", "confirmed", "cancelled", "completed"].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </article>
          ))
        )}
      </div>
    );
  }

  if (tab === "Support Tickets") {
    // Both Super Admin AND Regular Admin can change and resolve support tickets!
    return (
      <div className="data-list">
        {rows.length === 0 ? (
          <p>No support tickets recorded yet.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id}>
              <div>
                <b>{row.client_name || "Guest Client"}</b>
                <span style={{ marginLeft: "8px", fontSize: "10px", color: "#63594d" }}>
                  via {row.source || "chatbot"} · {new Date(row.created_at).toLocaleDateString()}
                </span>
                <p style={{ margin: "6px 0", fontStyle: "italic" }}>"{row.message}"</p>
                <small>
                  Email: {row.client_email || "N/A"} · Phone: {row.client_phone || "N/A"}
                </small>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                  value={row.status}
                  aria-label={`Status for ticket from ${row.client_name || "client"}`}
                  onChange={(event) => void save("support_tickets", row.id, { status: event.target.value })}
                >
                  {["open", "in_progress", "resolved"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                {row.status !== "resolved" && (
                  <button
                    type="button"
                    style={{ background: "#2e6930", color: "#fff", borderColor: "#2e6930" }}
                    onClick={() => void save("support_tickets", row.id, { status: "resolved" })}
                  >
                    ✓ Resolve
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="data-list">
      {rows.map((row) => (
        <Settings key={row.id} row={row} save={save} isSuperAdmin={isSuperAdmin} />
      ))}
    </div>
  );
}

// ─── AdminTeamTab (Super Admin Only: Create new admins, assign roles) ─────────
function AdminTeamTab({ isSuperAdmin, sessionToken }: { isSuperAdmin: boolean; sessionToken: string }) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"super_admin" | "admin">("admin");
  const [creating, setCreating] = useState(false);

  const fetchAdmins = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load admin accounts.");
      setAdmins(data.admins || []);
    } catch (err: any) {
      setError(err.message || "Failed to load staff accounts.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) void fetchAdmins();
  }, [fetchAdmins, sessionToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create admin.");
      setSuccess(`Admin account created for ${newEmail} as ${newRole === "super_admin" ? "Super Admin" : "Regular Admin"}.`);
      setNewEmail("");
      setNewPassword("");
      await fetchAdmins();
    } catch (err: any) {
      setError(err.message || "Failed to create admin.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(adm: any) {
    if (!confirm(`Are you sure you want to remove staff admin ${adm.email}?`)) return;
    try {
      setError("");
      const res = await fetch(`/api/admin/users?user_id=${adm.user_id}&admin_id=${adm.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove staff account.");
      await fetchAdmins();
    } catch (err: any) {
      setError(err.message || "Failed to remove admin.");
    }
  }

  async function handleToggleRole(adm: any) {
    const nextRole = adm.role === "super_admin" ? "admin" : "super_admin";
    try {
      setError("");
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ user_id: adm.user_id, role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role.");
      await fetchAdmins();
    } catch (err: any) {
      setError(err.message || "Failed to update role.");
    }
  }

  return (
    <div className="admin-team-section">
      <div className="admin-add" style={{ flexDirection: "column", alignItems: "stretch", gap: 14 }}>
        <h4 style={{ margin: 0, color: "var(--olive)", fontFamily: "Georgia, serif", fontSize: 22 }}>
          Create New Staff Admin
        </h4>
        <p style={{ margin: 0, fontSize: 12, color: "#63594d" }}>
          <strong>Super Admins:</strong> Full access to edit services, therapists, hours, settings, and manage staff.
          <br />
          <strong>Regular Admins:</strong> View-only access across the spa system and authority to resolve client support tickets.
        </p>
        <form onSubmit={handleCreate} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <input
            required
            type="email"
            placeholder="Staff email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            required
            type="password"
            placeholder="Temporary password (min 12 chars)"
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as any)}
            style={{ padding: "10px", background: "#fbf7ee" }}
          >
            <option value="admin">Regular Admin (View only + Resolve Tickets)</option>
            <option value="super_admin">Super Admin (Full Edit Access)</option>
          </select>
          <button className="button" disabled={creating} style={{ padding: "10px 18px" }}>
            {creating ? "Creating…" : "+ Create Admin Account"}
          </button>
        </form>
        {success && <p style={{ color: "#2e6930", fontSize: 12, margin: "4px 0 0" }}>✓ {success}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="data-list" style={{ marginTop: 22 }}>
        <h4 style={{ margin: "10px 0", color: "var(--olive)", fontSize: 16 }}>Existing Admin Accounts</h4>
        {loading ? (
          <p>Loading staff accounts…</p>
        ) : admins.length === 0 ? (
          <p>No admin accounts found.</p>
        ) : (
          admins.map((adm) => (
            <article key={adm.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <b>{adm.email}</b>
                <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      background: adm.role === "super_admin" ? "var(--olive)" : "#eae0cd",
                      color: adm.role === "super_admin" ? "#fff" : "var(--olive)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {adm.role === "super_admin" ? "👑 Super Admin" : "👤 Regular Admin"}
                  </span>
                  <small style={{ color: "#7a6e60" }}>
                    Added {new Date(adm.created_at).toLocaleDateString()}
                  </small>
                </div>
              </div>

              {isSuperAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void handleToggleRole(adm)}
                    style={{ fontSize: 10, padding: "6px 12px", border: "1px solid var(--olive)" }}
                    title="Switch role"
                  >
                    Make {adm.role === "super_admin" ? "Regular Admin" : "Super Admin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(adm)}
                    style={{ fontSize: 10, padding: "6px 10px", borderColor: "#9b2819", color: "#9b2819" }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

async function insertRow(db: any, table: string, values: Row, done: () => void) {
  const { error } = await db.from(table).insert(values);
  if (error) {
    console.error(`Admin insert into ${table} failed`, error);
    alert(error.message);
    return;
  }
  done();
}

async function uploadPhoto(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.url) { alert(data.error || "Upload failed"); return null; }
    return data.url as string;
  } catch {
    alert("Upload failed. Please try again.");
    return null;
  }
}

// ─── ServiceTab ──────────────────────────────────────────────────────────────
function ServiceTab({
  db, rows, refresh, save, remove, allCategories, customCategories, setCustomCategories, isSuperAdmin,
}: {
  db: any;
  rows: Row[];
  refresh: () => void;
  save: (table: string, id: string, values: Row) => Promise<void>;
  remove: (table: string, id: string) => Promise<void>;
  allCategories: string[];
  customCategories: string[];
  setCustomCategories: React.Dispatch<React.SetStateAction<string[]>>;
  isSuperAdmin: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      {isSuperAdmin && (
        <CreateService db={db} done={refresh} allCategories={allCategories} customCategories={customCategories} setCustomCategories={setCustomCategories} />
      )}
      <div className="data-list">
        {rows.map((row) => (
          <article key={row.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <div>
                <b>{row.name}</b>
                <span style={{ display: "inline-block", marginLeft: "8px", padding: "3px 8px", fontSize: "9px", letterSpacing: "0.05em", background: "#e9dfcf", color: "var(--olive)", fontWeight: 600 }}>
                  {row.category || "Massage Treatments"}
                </span>
                <p style={{ margin: "4px 0 2px" }}>{(row.description || "").replace(/\[img:(.*?)\]/g, "").trim() || "No description."}</p>
                <small>{naira(row.price)} · {row.duration_minutes} min · {row.is_active ? "Active" : "Inactive"}</small>
              </div>
              <div className="actions">
                {isSuperAdmin ? (
                  <>
                    <button onClick={() => setEditingId(editingId === row.id ? null : row.id)}>
                      {editingId === row.id ? "Close ▲" : "Edit details ▼"}
                    </button>
                    <button onClick={() => void save("services", row.id, { is_active: !row.is_active })}>
                      {row.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => void remove("services", row.id)}>Delete</button>
                  </>
                ) : (
                  <span style={{ fontSize: "10px", color: "#7a6e60" }}>View only</span>
                )}
              </div>
            </div>

            {isSuperAdmin && editingId === row.id && (
              <ServiceEditDrawer
                row={row}
                allCategories={allCategories}
                onSave={async (values) => { await save("services", row.id, values); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function ServiceEditDrawer({
  row, allCategories, onSave, onCancel,
}: {
  row: Row;
  allCategories: string[];
  onSave: (values: Row) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(row.name || "");
  const [category, setCategory] = useState(row.category || allCategories[0] || "Massage Treatments");
  const [price, setPrice] = useState(String(row.price || ""));
  const [duration, setDuration] = useState(String(row.duration_minutes || ""));
  const [description, setDescription] = useState(
    (row.description || "").replace(/\[img:(.*?)\]/g, "").trim()
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => {
    const m = (row.description || "").match(/\[img:(.*?)\]/);
    return m ? m[1] : null;
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadPhoto(file);
    setUploading(false);
    if (url) setPhotoUrl(url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const finalDesc = encodeServiceMedia(description, photoUrl);
    await onSave({
      name: name.trim(),
      category: category.trim(),
      price: Number(price),
      duration_minutes: Number(duration),
      description: finalDesc,
    });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="edit-drawer">
      <div className="edit-drawer-grid">
        <label>
          Service Name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Price (₦)
          <input required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          Duration (minutes)
          <input required type="number" min="5" max="480" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
        <label className="drawer-wide">
          Description
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="drawer-wide" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: "10px", color: "var(--olive)", fontWeight: 600 }}>PHOTO (OPTIONAL)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: "11px" }} />
          </div>
          {photoUrl && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <img src={photoUrl} alt="preview" style={{ width: "48px", height: "48px", objectFit: "cover", border: "1px solid var(--olive)" }} />
              <button type="button" onClick={() => setPhotoUrl(null)} style={{ fontSize: "10px" }}>Remove</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
        <button className="button" disabled={uploading || saving}>{saving ? "Saving…" : "Save changes"}</button>
        <button type="button" onClick={onCancel} style={{ fontSize: "11px", padding: "8px 14px" }}>Cancel</button>
      </div>
    </form>
  );
}

function CreateService({
  db, done, allCategories, customCategories, setCustomCategories,
}: {
  db: any;
  done: () => void;
  allCategories: string[];
  customCategories: string[];
  setCustomCategories: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);

    let photoUrl: string | null = null;
    if (fileRef.current?.files?.[0]) {
      setUploading(true);
      photoUrl = await uploadPhoto(fileRef.current.files[0]);
      setUploading(false);
      if (!photoUrl) return;
    }

    const rawDesc = String(form.get("description") || "").trim();
    const finalDesc = encodeServiceMedia(rawDesc, photoUrl);

    await insertRow(db, "services", {
      name: String(form.get("name")).trim(),
      category: String(form.get("category")),
      description: finalDesc,
      duration_minutes: Number(form.get("duration")),
      price: Number(form.get("price")),
      is_active: true,
    }, done);
    element.reset();
    setPhotoPreview(null);
  }

  function handleAddCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (!allCategories.includes(trimmed)) {
      setCustomCategories((prev) => [...prev, trimmed]);
    }
    setNewCatName("");
    setNewCatOpen(false);
  }

  return (
    <div style={{ marginBottom: "18px" }}>
      <form onSubmit={submit} className="admin-add">
        <input name="name" required maxLength={120} placeholder="Service name" />
        <select name="category" required style={{ minWidth: "160px", padding: "10px", background: "#fbf7ee" }}>
          {allCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNewCatOpen(!newCatOpen)}
          style={{ fontSize: "10px", padding: "9px 11px", border: "1px solid var(--olive)", background: "#f4ecdc", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {newCatOpen ? "✕ Close" : "+ New category"}
        </button>
        <input name="price" required type="number" min="0" placeholder="Price (₦)" />
        <input name="duration" required type="number" min="5" max="480" placeholder="Duration (mins)" />
        <input name="description" maxLength={1000} placeholder="Description (optional)" style={{ flex: 2, minWidth: "180px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "9px", letterSpacing: "0.1em", color: "var(--olive)", fontWeight: 600 }}>UPLOAD PHOTO</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ fontSize: "11px" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPhotoPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          {photoPreview && (
            <img src={photoPreview} alt="preview" style={{ width: "48px", height: "48px", objectFit: "cover", border: "1px solid var(--olive)" }} />
          )}
        </div>
        <button className="button" disabled={uploading}>{uploading ? "Uploading…" : "Add service"}</button>
      </form>

      {newCatOpen && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 14px", background: "#e0d5c1", border: "1px solid var(--line)" }}>
          <input
            type="text"
            placeholder="New Category Name (e.g. Body Scrubs &amp; Wraps)"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            style={{ flex: 1, padding: "8px", fontSize: "12px" }}
          />
          <button type="button" onClick={handleAddCategory} className="button" style={{ padding: "8px 16px" }}>Save category</button>
        </div>
      )}
    </div>
  );
}

function CreateTherapist({ db, done }: { db: any; done: () => void }) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);

    let photoUrl: string | null = null;
    if (fileRef.current?.files?.[0]) {
      setUploading(true);
      photoUrl = await uploadPhoto(fileRef.current.files[0]);
      setUploading(false);
      if (!photoUrl) return;
    }

    await insertRow(db, "therapists", {
      full_name: String(form.get("name")).trim(),
      bio: String(form.get("bio")).trim() || null,
      photo_url: photoUrl,
      is_active: true,
    }, done);
    element.reset();
    setPhotoPreview(null);
  }

  return (
    <form onSubmit={submit} className="admin-add">
      <input name="name" required maxLength={120} placeholder="Therapist name" />
      <input name="bio" maxLength={1000} placeholder="Bio (optional)" />
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "9px", letterSpacing: "0.1em", color: "var(--olive)", fontWeight: 600 }}>UPLOAD PHOTO</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ fontSize: "11px" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPhotoPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        {photoPreview && (
          <img src={photoPreview} alt="preview" style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "50%", border: "2px solid var(--olive)" }} />
        )}
      </div>
      <button className="button" disabled={uploading}>{uploading ? "Uploading…" : "Add therapist"}</button>
    </form>
  );
}

function Therapist({
  row, services, db, done, save, remove, isSuperAdmin,
}: {
  row: Row;
  services: Row[];
  db: any;
  done: () => void;
  save: (table: string, id: string, values: Row) => Promise<void>;
  remove: (table: string, id: string) => Promise<void>;
  isSuperAdmin: boolean;
}) {
  const [offDate, setOffDate] = useState("");
  const [offMsg, setOffMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(row.full_name || "");
  const [editBio, setEditBio] = useState(row.bio || "");
  const [editPhoto, setEditPhoto] = useState<string | null>(row.photo_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mappedServiceIds = new Set<string>(
    (row.therapist_services || []).map((m: Row) => m.service_id),
  );
  const offDays: Row[] = row.therapist_time_off || [];

  async function toggleService(serviceId: string) {
    if (!isSuperAdmin) return;
    const exists = mappedServiceIds.has(serviceId);
    if (exists) {
      await db.from("therapist_services").delete().eq("therapist_id", row.id).eq("service_id", serviceId);
    } else {
      await db.from("therapist_services").insert({ therapist_id: row.id, service_id: serviceId });
    }
    done();
  }

  async function addOffDay() {
    if (!isSuperAdmin) return;
    if (!offDate) return;
    setOffMsg("");
    const { error } = await db.from("therapist_time_off").insert({
      therapist_id: row.id,
      off_date: offDate,
    });
    if (error) {
      setOffMsg(error.message);
    } else {
      setOffMsg("✓ Added");
      setOffDate("");
      done();
    }
  }

  async function removeOffDay(offDayId: string) {
    if (!isSuperAdmin) return;
    const { error } = await db.from("therapist_time_off").delete().eq("id", offDayId);
    if (error) {
      setOffMsg(error.message);
      return;
    }
    done();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadPhoto(file);
    setUploading(false);
    if (url) setEditPhoto(url);
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await save("therapists", row.id, {
      full_name: editName.trim(),
      bio: editBio.trim() || null,
      photo_url: editPhoto,
    });
    setSaving(false);
    setEditing(false);
  }

  return (
    <article style={{ flexDirection: "column", alignItems: "stretch", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          {row.photo_url ? (
            <img src={row.photo_url} alt={row.full_name} style={{ width: "54px", height: "54px", objectFit: "cover", borderRadius: "50%", border: "2px solid var(--olive)" }} />
          ) : (
            <div style={{ width: "54px", height: "54px", borderRadius: "50%", background: "#dfd2be", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>👤</div>
          )}
          <div>
            <b>{row.full_name}</b>
            <p style={{ margin: "3px 0 0" }}>{row.bio || "No bio entered."}</p>
            <small style={{ color: row.is_active ? "#2e6930" : "#9b2819" }}>{row.is_active ? "Active" : "Inactive"}</small>
          </div>
        </div>
        <div className="actions">
          {isSuperAdmin ? (
            <>
              <button onClick={() => setEditing(!editing)}>{editing ? "Close ▲" : "Edit details ▼"}</button>
              <button onClick={() => void save("therapists", row.id, { is_active: !row.is_active })}>
                {row.is_active ? "Deactivate" : "Activate"}
              </button>
              <button onClick={() => void remove("therapists", row.id)}>Delete</button>
            </>
          ) : (
            <span style={{ fontSize: "10px", color: "#7a6e60" }}>View only</span>
          )}
        </div>
      </div>

      {isSuperAdmin && editing && (
        <form onSubmit={handleSaveDetails} className="edit-drawer">
          <div className="edit-drawer-grid">
            <label>
              Therapist Name
              <input required value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label>
              Upload / Replace Photo
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: "11px" }} />
            </label>
            <label className="drawer-wide">
              Bio
              <textarea rows={2} value={editBio} onChange={(e) => setEditBio(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button className="button" disabled={uploading || saving}>{saving ? "Saving…" : "Save details"}</button>
            <button type="button" onClick={() => setEditing(false)} style={{ fontSize: "11px", padding: "8px 14px" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Services qualified */}
      <div>
        <label style={{ fontSize: "10px", letterSpacing: "0.1em", color: "var(--olive)", fontWeight: 600 }}>
          SERVICES THIS THERAPIST PROVIDES
        </label>
        <div className="chips">
          {services.map((service) => {
            const active = mappedServiceIds.has(service.id);
            return (
              <button
                key={service.id}
                type="button"
                className={`chip ${active ? "active" : ""}`}
                disabled={!isSuperAdmin}
                onClick={() => void toggleService(service.id)}
              >
                {active ? "✓ " : "+ "}
                {service.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Off-days calendar */}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
        <label style={{ fontSize: "10px", letterSpacing: "0.1em", color: "var(--olive)", fontWeight: 600 }}>
          THERAPIST OFF-DAYS
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "8px 0" }}>
          {offDays.length === 0 ? (
            <small style={{ color: "#7a6e60" }}>No upcoming off-days recorded.</small>
          ) : (
            offDays.map((od) => (
              <span
                key={od.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "#f0e5d4",
                  border: "1px solid var(--line)",
                  padding: "3px 8px",
                  fontSize: "11px",
                }}
              >
                {od.off_date}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => void removeOffDay(od.id)}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "#9b2819", fontSize: "12px", lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        {isSuperAdmin && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
            <input
              type="date"
              value={offDate}
              onChange={(e) => setOffDate(e.target.value)}
              style={{ fontSize: "11px", padding: "6px" }}
            />
            <button type="button" onClick={addOffDay} style={{ fontSize: "10px", padding: "7px 12px", border: "1px solid var(--olive)" }}>
              Add day off
            </button>
            {offMsg && <small style={{ color: offMsg.startsWith("✓") ? "#2e6930" : "#9b2819" }}>{offMsg}</small>}
          </div>
        )}
      </div>
    </article>
  );
}

function CreateBlocked({ db, done }: { db: any; done: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await insertRow(db, "blocked_dates", {
      blocked_date: form.get("date"),
      reason: String(form.get("reason") || "").trim() || null,
    }, done);
    element.reset();
  }
  return (
    <form onSubmit={submit} className="admin-add">
      <input name="date" required type="date" />
      <input name="reason" maxLength={250} placeholder="Reason (e.g. Renovation, Public Holiday)" />
      <button className="button">Block date</button>
    </form>
  );
}

function BusinessHour({ row, save, isSuperAdmin }: { row: Row; save: (table: string, id: string, values: Row) => Promise<void>; isSuperAdmin: boolean }) {
  const [start, setStart] = useState(row.start_time?.slice(0, 5) || "10:00");
  const [end, setEnd] = useState(row.end_time?.slice(0, 5) || "20:00");
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <article>
      <div>
        <b>{weekdayNames[row.weekday]}</b>
        {row.is_open ? (
          <div className="actions">
            <input
              type="time"
              disabled={!isSuperAdmin}
              aria-label="Opening time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <input
              type="time"
              disabled={!isSuperAdmin}
              aria-label="Closing time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            {isSuperAdmin && (
              <button
                onClick={() => {
                  if (start < end) void save("business_hours", row.id, { start_time: start, end_time: end });
                }}
              >
                Save hours
              </button>
            )}
          </div>
        ) : (
          <p style={{ color: "#9b2819", fontWeight: 500 }}>Closed</p>
        )}
      </div>
      {isSuperAdmin && (
        <button onClick={() => void save("business_hours", row.id, { is_open: !row.is_open })}>
          {row.is_open ? "Close day" : "Open day"}
        </button>
      )}
    </article>
  );
}

function Settings({ row, save, isSuperAdmin }: { row: Row; save: (table: string, id: string, values: Row) => Promise<void>; isSuperAdmin: boolean }) {
  const [values, setValues] = useState({
    spa_name: row.spa_name || "",
    spa_email: row.spa_email || "",
    spa_phone: row.spa_phone || "",
    spa_address: row.spa_address || "",
    slot_interval_minutes: String(row.slot_interval_minutes),
    booking_notice_hours: String(row.booking_notice_hours),
    booking_policies: row.booking_policies || "",
  });

  function set(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <article>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isSuperAdmin) return;
          const interval = Number(values.slot_interval_minutes);
          const notice = Number(values.booking_notice_hours);
          if (
            !values.spa_name.trim() ||
            !Number.isInteger(interval) ||
            interval < 5 ||
            interval > 240 ||
            !Number.isInteger(notice) ||
            notice < 0 ||
            notice > 720
          )
            return;
          void save("spa_settings", row.id, {
            ...values,
            spa_name: values.spa_name.trim(),
            spa_email: values.spa_email.trim() || null,
            spa_phone: values.spa_phone.trim() || null,
            spa_address: values.spa_address.trim() || null,
            slot_interval_minutes: interval,
            booking_notice_hours: notice,
            booking_policies: values.booking_policies.trim() || null,
          });
        }}
      >
        <label>
          Spa name
          <input disabled={!isSuperAdmin} required value={values.spa_name} onChange={(event) => set("spa_name", event.target.value)} />
        </label>
        <label>
          Email
          <input disabled={!isSuperAdmin} type="email" value={values.spa_email} onChange={(event) => set("spa_email", event.target.value)} />
        </label>
        <label>
          Phone
          <input disabled={!isSuperAdmin} value={values.spa_phone} onChange={(event) => set("spa_phone", event.target.value)} />
        </label>
        <label>
          Address
          <input disabled={!isSuperAdmin} value={values.spa_address} onChange={(event) => set("spa_address", event.target.value)} />
        </label>
        <label>
          Slot interval (minutes)
          <input
            disabled={!isSuperAdmin}
            required
            type="number"
            min="5"
            max="240"
            value={values.slot_interval_minutes}
            onChange={(event) => set("slot_interval_minutes", event.target.value)}
          />
        </label>
        <label>
          Booking notice (hours)
          <input
            disabled={!isSuperAdmin}
            required
            type="number"
            min="0"
            max="720"
            step="1"
            value={values.booking_notice_hours}
            onChange={(event) => set("booking_notice_hours", event.target.value)}
          />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          Booking &amp; Cancellation Policies
          <textarea
            disabled={!isSuperAdmin}
            rows={8}
            value={values.booking_policies}
            onChange={(event) => set("booking_policies", event.target.value)}
            placeholder="Enter full spa booking, deposit, cancellation and attendance guidelines..."
            style={{
              padding: "12px",
              border: "1px solid rgba(30, 24, 18, 0.2)",
              font: "12px/1.6 'Inter', sans-serif",
              background: "#faf5ea",
              color: "var(--ink)",
              resize: "vertical",
              width: "100%",
              marginTop: "4px",
            }}
          />
        </label>
        {isSuperAdmin ? (
          <button className="button" style={{ gridColumn: "1 / -1", justifySelf: "start" }}>Save settings</button>
        ) : (
          <p style={{ gridColumn: "1 / -1", fontSize: "11px", color: "#7a6e60" }}>
            🔒 Settings editing is reserved for Super Admins.
          </p>
        )}
      </form>
    </article>
  );
}
