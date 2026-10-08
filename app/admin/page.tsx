"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { naira } from "@/lib/format";

const tabs = [
  "Overview",
  "Appointments",
  "Services",
  "Therapists",
  "Business Hours",
  "Blocked Dates",
  "Support Tickets",
  "Spa Settings",
] as const;

type Tab = typeof tabs[number];
type Row = Record<string, any>;

const tableFor: Record<Exclude<Tab, "Overview">, string> = {
  Appointments: "appointments",
  Services: "services",
  Therapists: "therapists",
  "Business Hours": "business_hours",
  "Blocked Dates": "blocked_dates",
  "Support Tickets": "support_tickets",
  "Spa Settings": "spa_settings",
};

const TREATMENT_CATEGORIES = [
  "Massage Treatments",
  "Facial Treatments",
  "Body Treatments",
  "Hand & Foot Treatments",
] as const;

export default function Admin() {
  const [state, setState] = useState<"loading" | "login" | "denied" | "admin">("loading");
  const [tab, setTab] = useState<Tab>("Overview");
  const [rows, setRows] = useState<Row[]>([]);
  const [services, setServices] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [db, setDb] = useState<ReturnType<typeof supabase> | null>(null);

  useEffect(() => {
    setDb(supabase());
  }, []);

  const load = useCallback(async (name: Tab = tab) => {
    if (!db) return;
    setError("");
    setLoading(true);
    try {
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
      let query = db.from(table).select(
        name === "Appointments"
          ? "*,services(name,category),therapists(full_name)"
          : name === "Therapists"
            ? "*,therapist_services(service_id),therapist_time_off(id,off_date,start_time,end_time)"
            : "*",
      );

      if (name === "Appointments" || name === "Support Tickets") {
        query = query.order("created_at", { ascending: false });
      } else if (name === "Services") {
        query = query.order("category", { ascending: true }).order("price", { ascending: true });
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

  // Auth verification
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
        const { data, error: adminError } = await db.from("admin_users")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!mounted) return;
        if (adminError) throw adminError;
        setState(data ? "admin" : "denied");
      } catch (authError) {
        console.error("Admin authorization check failed", authError);
        if (mounted) {
          setError("Unable to verify staff access. Please try signing in again.");
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

  // Supabase Real-time Subscriptions: Sync Appointments, Tickets, and Services automatically!
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
        if (["confirmed", "cancelled"].includes(values.status) && !result.emailSent) {
          setError("Appointment status was updated, but its email notification was not sent. Check Resend configuration.");
        }
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
          CEE ESSENCE<small>SPA & WELLNESS · ADMIN</small>
        </div>
        {tabs.map((item) => (
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
        {error && <p className="error" role="alert">{error}</p>}
        {loading ? <p>Loading data…</p> : <Content tab={tab} rows={rows} services={services} db={db} refresh={() => load()} save={save} remove={remove} />}
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
}: {
  tab: Tab;
  rows: Row[];
  services: Row[];
  db: any;
  refresh: () => void;
  save: (table: string, id: string, values: Row) => Promise<void>;
  remove: (table: string, id: string) => Promise<void>;
}) {
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
    return (
      <>
        <CreateService db={db} done={refresh} />
        <div className="data-list">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <b>{row.name}</b>
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: "8px",
                    padding: "3px 8px",
                    fontSize: "9px",
                    letterSpacing: "0.05em",
                    background: "#e9dfcf",
                    color: "var(--olive)",
                    fontWeight: 600,
                  }}
                >
                  {row.category || "Massage Treatments"}
                </span>
                <p>{row.description || "No description provided."}</p>
                <small>
                  {naira(row.price)} · {row.duration_minutes} min · {row.is_active ? "Active" : "Inactive"}
                </small>
              </div>
              <div className="actions">
                <button
                  onClick={() => {
                    const name = prompt("Treatment name", row.name);
                    if (name === null) return;
                    const category = prompt(
                      "Category (Massage Treatments / Facial Treatments / Body Treatments / Hand & Foot Treatments)",
                      row.category || "Massage Treatments",
                    );
                    if (category === null) return;
                    const description = prompt("Description", row.description || "");
                    if (description === null) return;
                    const duration = prompt("Duration in minutes", String(row.duration_minutes));
                    if (duration === null) return;
                    const price = prompt("Price in naira", String(row.price ?? ""));
                    if (price === null) return;
                    const durationMinutes = Number(duration);
                    const priceValue = Number(price);
                    if (!name.trim() || !Number.isInteger(durationMinutes) || durationMinutes < 1 || !Number.isFinite(priceValue) || priceValue < 0) return;
                    void save("services", row.id, {
                      name: name.trim(),
                      category: category.trim() || "Massage Treatments",
                      description: description.trim() || null,
                      duration_minutes: durationMinutes,
                      price: priceValue,
                    });
                  }}
                >
                  Edit details
                </button>
                <button onClick={() => void save("services", row.id, { is_active: !row.is_active })}>
                  {row.is_active ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => void remove("services", row.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </>
    );
  }

  if (tab === "Therapists") {
    return (
      <>
        <CreateTherapist db={db} done={refresh} />
        <div className="data-list">
          {rows.map((row) => (
            <Therapist key={row.id} row={row} services={services} db={db} done={refresh} save={save} remove={remove} />
          ))}
        </div>
      </>
    );
  }

  if (tab === "Business Hours") {
    return (
      <div className="data-list">
        {rows.map((row) => (
          <BusinessHour key={row.id} row={row} save={save} />
        ))}
      </div>
    );
  }

  if (tab === "Blocked Dates") {
    return (
      <>
        <CreateBlocked db={db} done={refresh} />
        <div className="data-list">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <b>{row.blocked_date}</b>
                <p>{row.reason || "Spa closed / Public holiday"}</p>
              </div>
              <button onClick={() => void remove("blocked_dates", row.id)}>Remove</button>
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
              <select
                value={row.status}
                aria-label={`Status for ticket from ${row.client_name || "client"}`}
                onChange={(event) => void save("support_tickets", row.id, { status: event.target.value })}
              >
                {["open", "in_progress", "resolved"].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </article>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="data-list">
      {rows.map((row) => (
        <Settings key={row.id} row={row} save={save} />
      ))}
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

function CreateService({ db, done }: { db: any; done: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await insertRow(
      db,
      "services",
      {
        name: String(form.get("name")).trim(),
        category: String(form.get("category")).trim() || "Massage Treatments",
        description: String(form.get("description") || "").trim() || null,
        duration_minutes: Number(form.get("duration")),
        price: Number(form.get("price")),
        is_active: true,
      },
      done,
    );
    element.reset();
  }

  return (
    <form onSubmit={submit} className="admin-add">
      <select name="category" required style={{ minWidth: "160px", padding: "10px" }}>
        {TREATMENT_CATEGORIES.map((cat) => (
          <option value={cat} key={cat}>
            {cat}
          </option>
        ))}
      </select>
      <input name="name" required maxLength={120} placeholder="Treatment name" />
      <input name="duration" required min="1" type="number" placeholder="Minutes" />
      <input name="price" required min="0" step="1" type="number" placeholder="Price in naira" />
      <input name="description" maxLength={1000} placeholder="Description (optional)" />
      <button className="button">Add treatment</button>
    </form>
  );
}

function CreateTherapist({ db, done }: { db: any; done: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await insertRow(
      db,
      "therapists",
      {
        full_name: String(form.get("name")).trim(),
        bio: String(form.get("bio")).trim() || null,
        photo_url: String(form.get("photo")).trim() || null,
        is_active: true,
      },
      done,
    );
    element.reset();
  }
  return (
    <form onSubmit={submit} className="admin-add">
      <input name="name" required maxLength={120} placeholder="Therapist name" />
      <input name="bio" maxLength={1000} placeholder="Bio" />
      <input name="photo" type="url" placeholder="Photo URL" />
      <button className="button">Add therapist</button>
    </form>
  );
}

function CreateBlocked({ db, done }: { db: any; done: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await insertRow(
      db,
      "blocked_dates",
      {
        blocked_date: form.get("date"),
        reason: String(form.get("reason") || "").trim() || null,
      },
      done,
    );
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

function Therapist({
  row,
  services,
  db,
  done,
  save,
  remove,
}: {
  row: Row;
  services: Row[];
  db: any;
  done: () => void;
  save: (table: string, id: string, values: Row) => Promise<void>;
  remove: (table: string, id: string) => Promise<void>;
}) {
  const [offDate, setOffDate] = useState("");
  const assigned = row.therapist_services?.map((mapping: Row) => mapping.service_id) || [];

  async function toggleService(serviceId: string) {
    const result = assigned.includes(serviceId)
      ? await db.from("therapist_services").delete().eq("therapist_id", row.id).eq("service_id", serviceId)
      : await db.from("therapist_services").insert({ therapist_id: row.id, service_id: serviceId });
    if (result.error) alert(result.error.message);
    else done();
  }

  return (
    <article>
      <div>
        <b>{row.full_name}</b>
        <p>{row.bio}</p>
        <small>
          {row.is_active ? "Active" : "Inactive"} ·{" "}
          {services
            .filter((service) => assigned.includes(service.id))
            .map((service) => service.name)
            .join(" · ") || "No treatments assigned"}
        </small>
        <div className="chips">
          {services.map((service) => (
            <button
              type="button"
              className={assigned.includes(service.id) ? "chip active" : "chip"}
              onClick={() => void toggleService(service.id)}
              key={service.id}
            >
              {service.name}
            </button>
          ))}
        </div>
        <div className="actions">
          {(row.therapist_time_off || []).map((absence: Row) => (
            <span className="chip" key={absence.id}>
              {absence.off_date}{" "}
              <button
                type="button"
                aria-label={`Remove time off on ${absence.off_date}`}
                onClick={() => void remove("therapist_time_off", absence.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="actions">
          <input
            aria-label={`Day off for ${row.full_name}`}
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={offDate}
            onChange={(event) => setOffDate(event.target.value)}
          />
          <button
            type="button"
            disabled={!offDate}
            onClick={async () => {
              const result = await db.from("therapist_time_off").insert({ therapist_id: row.id, off_date: offDate });
              if (result.error) alert(result.error.message);
              else {
                setOffDate("");
                done();
              }
            }}
          >
            Add day off
          </button>
        </div>
      </div>
      <div className="actions">
        <button
          onClick={() => {
            const fullName = prompt("Therapist name", row.full_name);
            if (fullName === null) return;
            const bio = prompt("Therapist bio", row.bio || "");
            if (bio === null) return;
            const photoUrl = prompt("Photo URL (optional)", row.photo_url || "");
            if (photoUrl === null) return;
            void save("therapists", row.id, {
              full_name: fullName.trim(),
              bio: bio.trim() || null,
              photo_url: photoUrl.trim() || null,
            });
          }}
        >
          Edit details
        </button>
        <button onClick={() => void save("therapists", row.id, { is_active: !row.is_active })}>
          {row.is_active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </article>
  );
}

function BusinessHour({ row, save }: { row: Row; save: (table: string, id: string, values: Row) => Promise<void> }) {
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
              aria-label="Opening time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <input
              type="time"
              aria-label="Closing time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            <button
              onClick={() => {
                if (start < end) void save("business_hours", row.id, { start_time: start, end_time: end });
              }}
            >
              Save hours
            </button>
          </div>
        ) : (
          <p style={{ color: "#9b2819", fontWeight: 500 }}>Closed</p>
        )}
      </div>
      <button onClick={() => void save("business_hours", row.id, { is_open: !row.is_open })}>
        {row.is_open ? "Close day" : "Open day"}
      </button>
    </article>
  );
}

function Settings({ row, save }: { row: Row; save: (table: string, id: string, values: Row) => Promise<void> }) {
  const [values, setValues] = useState({
    spa_name: row.spa_name || "",
    spa_email: row.spa_email || "",
    spa_phone: row.spa_phone || "",
    spa_address: row.spa_address || "",
    slot_interval_minutes: String(row.slot_interval_minutes),
    booking_notice_hours: String(row.booking_notice_hours),
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
          });
        }}
      >
        <label>
          Spa name
          <input required value={values.spa_name} onChange={(event) => set("spa_name", event.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={values.spa_email} onChange={(event) => set("spa_email", event.target.value)} />
        </label>
        <label>
          Phone
          <input value={values.spa_phone} onChange={(event) => set("spa_phone", event.target.value)} />
        </label>
        <label>
          Address
          <input value={values.spa_address} onChange={(event) => set("spa_address", event.target.value)} />
        </label>
        <label>
          Slot interval (minutes)
          <input
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
            required
            type="number"
            min="0"
            max="720"
            step="1"
            value={values.booking_notice_hours}
            onChange={(event) => set("booking_notice_hours", event.target.value)}
          />
        </label>
        <button className="button">Save settings</button>
      </form>
    </article>
  );
}
