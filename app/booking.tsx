"use client";
import { useEffect, useMemo, useState } from "react";
import { duration, naira, timeLabel } from "@/lib/format";
import type { Service, Therapist } from "@/lib/types";
type Props = { services: Service[]; therapists: Therapist[] };
export function Booking({ services, therapists }: Props) {
 const [serviceId, setService] = useState(services[0]?.id || ""), [therapistId, setTherapist] = useState(""), [date, setDate] = useState(""), [time, setTime] = useState(""), [slots, setSlots] = useState<string[]>([]), [submitted, setSubmitted] = useState(false), [loading, setLoading] = useState(false), [loadingSlots, setLoadingSlots] = useState(false), [error, setError] = useState(""), [confirmationMessage, setConfirmationMessage] = useState("");
 const service = services.find(s => s.id === serviceId); const qualified = useMemo(() => therapists.filter(t => t.therapist_services?.some(m => m.service_id === serviceId)), [therapists, serviceId]);
 useEffect(() => { setTherapist(""); setTime(""); }, [serviceId]);
 useEffect(() => {
  if (!date || !serviceId) { setSlots([]); setLoadingSlots(false); return; }
  const controller = new AbortController();
  setLoadingSlots(true); setTime(""); setError("");
  fetch(`/api/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}&therapistId=${encodeURIComponent(therapistId)}`, { signal: controller.signal })
   .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load availability."); return data; })
   .then(data => setSlots(Array.isArray(data.slots) ? data.slots : []))
   .catch(requestError => { if (!(requestError instanceof DOMException && requestError.name === "AbortError")) { setSlots([]); setError(requestError instanceof Error ? requestError.message : "Unable to load availability."); } })
   .finally(() => { if (!controller.signal.aborted) setLoadingSlots(false); });
  return () => controller.abort();
 }, [date, serviceId, therapistId]);
 async function submit(form: FormData) {
  setLoading(true); setError("");
  try {
   const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_id: serviceId, therapist_id: therapistId || null, appointment_date: date, start_time: time, full_name: form.get("name"), email: form.get("email"), phone: form.get("phone"), notes: form.get("notes") }) });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || "We could not reserve that time. Please try another slot.");
   setConfirmationMessage(data.emailMessage || "Your booking request has been saved.");
   setSubmitted(true);
  } catch (requestError) {
   setError(requestError instanceof Error ? requestError.message : "We could not reserve that time. Please try another slot.");
  } finally { setLoading(false); }
 }
 if (submitted) return <div className="confirmation"><span className="leaf">❦</span><h3>Your session request is received.</h3><p>{confirmationMessage}</p><button className="text-button" onClick={() => { setSubmitted(false); setTime(""); }}>Make another booking</button></div>;
 return <form action={submit} className="booking-form"><div className="field wide"><label>01 · Choose your treatment</label><select required value={serviceId} onChange={e => setService(e.target.value)}>{services.map(s => <option value={s.id} key={s.id}>{s.name} — {naira(s.price)} · {duration(s.duration_minutes)}</option>)}</select></div><div className="field"><label>02 · Preferred therapist</label><select value={therapistId} onChange={e => setTherapist(e.target.value)}><option value="">Any available therapist</option>{qualified.map(t => <option value={t.id} key={t.id}>{t.full_name}</option>)}</select></div><div className="field"><label>03 · Select a date</label><input required type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={e => { setDate(e.target.value); setTime(""); }} /></div><div className="field wide"><label>04 · Available times</label><div className="slots">{!date ? <p>Select a date to view availability.</p> : loadingSlots ? <p>Checking open times…</p> : error ? <p>{error}</p> : slots.length ? slots.map(s => <button type="button" className={time === s ? "selected" : ""} onClick={() => setTime(s)} key={s}>{timeLabel(s)}</button>) : <p>No open times for this date.</p>}</div></div><div className="field"><label>05 · Your name</label><input name="name" required maxLength={120} placeholder="Full name" /></div><div className="field"><label>Phone number</label><input name="phone" required maxLength={40} placeholder="+234" /></div><div className="field"><label>Email address</label><input name="email" required maxLength={254} type="email" placeholder="you@email.com" /></div><div className="field"><label>Notes (optional)</label><input name="notes" maxLength={2000} placeholder="Anything we should know?" /></div>{error && !loadingSlots && <p className="error" role="alert">{error}</p>}<button disabled={!service || !date || !time || loading || loadingSlots} className="button submit">{loading ? "Reserving…" : "Confirm reservation →"}</button></form>;
}
