import Image from "next/image";
import Link from "next/link";
import { Booking } from "./booking";
import { Concierge } from "./chat";
import { adminSupabase } from "@/lib/supabase";
import { duration, naira } from "@/lib/format";
import type { Service, Settings, Therapist } from "@/lib/types";

export const dynamic = "force-dynamic";

const fallback = { spa_name: "Cee Essence Spa & Wellness", spa_email: "hello@ceeessencespa.com", spa_phone: "+234 800 CEE-SPA1", spa_address: "Shop P8, The Bints Centre by Haimbridge, Abuja" };
export default async function Home() {
  const db = adminSupabase();
  const [{ data: services }, { data: therapists }, { data: setting }] = await Promise.all([
    db.from("services").select("*").eq("is_active", true).order("price"),
    db.from("therapists").select("*, therapist_services(service_id,services(name))").eq("is_active", true),
    db.from("spa_settings").select("*").limit(1).maybeSingle()
  ]);
  const info = { ...fallback, ...setting } as Settings & typeof fallback;
  return <main>
    <nav><Link href="#home" className="wordmark">CEE ESSENCE <small>SPA & WELLNESS</small></Link><div className="navlinks"><a href="#treatments">Treatments</a><a href="#therapists">Therapists</a><a href="#about">Our story</a></div><a className="button small" href="#book">Reserve a session</a></nav>
    <section id="home" className="hero"><Image priority fill sizes="100vw" src="https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=2000&q=85" alt="Spa massage treatment" /><div className="hero-shade" /><div className="hero-copy"><span className="eyebrow">ABUJA · REFINED WELLNESS</span><h1>Return to your<br /><i>natural rhythm.</i></h1><p>Thoughtful treatments, unhurried moments, and a space made for your restoration.</p><a className="button" href="#book">Book your treatment <span>→</span></a></div><aside className="hero-note"><span className="leaf">❦</span><b>Private care, thoughtfully considered.</b><p>Every appointment is tailored to the way you want to feel.</p></aside></section>
    <section id="treatments" className="section treatments"><div className="section-top"><div><span className="eyebrow">OUR TREATMENTS</span><h2>Wellness, with<br />intention.</h2></div><p>From restorative massage to considered facial and body care, find the treatment that meets you where you are.</p></div><div className="service-grid">{(services as Service[] ?? []).map((service, i) => <article className="service-card" key={service.id}><span>0{i + 1}</span><h3>{service.name}</h3><p>{service.description}</p><div><b>{naira(service.price)}</b><em>{duration(service.duration_minutes)}</em></div></article>)}</div></section>
    <section id="therapists" className="therapists"><div className="therapist-title"><span className="eyebrow">THE HANDS BEHIND YOUR CARE</span><h2>Meet your<br /><i>therapists.</i></h2></div><div className="therapist-list">{(therapists as Therapist[] ?? []).map((t, i) => <article className="therapist" key={t.id}><div className="portrait"><Image fill sizes="(max-width: 800px) 100vw, 30vw" src={t.photo_url || ["https://images.unsplash.com/photo-1519415943484-9fa1873496d4?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1560750588-73207b1ef5b8?auto=format&fit=crop&w=900&q=80"][i]} alt={t.full_name} /></div><h3>{t.full_name}</h3><p>{t.bio}</p><small>{t.therapist_services?.map(s => s.services?.name).filter(Boolean).join(" · ")}</small></article>)}</div></section>
    <section id="about" className="about"><div><span className="eyebrow">THE CEE ESSENCE WAY</span><h2>Beauty meets<br /><i>refined wellness.</i></h2></div><p>At Cee Essence, restoration is more than a treatment. It is the quiet confidence that follows an hour made entirely for you. We pair purposeful rituals with a warm, elevated approach to care.</p></section>
    <section id="book" className="booking-section"><span className="eyebrow">YOUR APPOINTMENT</span><h2>Reserve your<br /><i>session.</i></h2><Booking services={(services as Service[]) ?? []} therapists={(therapists as Therapist[]) ?? []} /></section>
    <section className="contact"><div><span className="eyebrow">VISIT CEE ESSENCE</span><h2>A pause, well<br /><i>deserved.</i></h2></div><div><p>{info.spa_address}</p><p>{info.spa_phone}<br />{info.spa_email}</p><p>Monday–Saturday · 10:00am–8:00pm<br />Sunday · 12:00pm–6:00pm</p></div></section>
    <footer><div className="wordmark">CEE ESSENCE <small>SPA & WELLNESS</small></div><p>© {new Date().getFullYear()} {info.spa_name}</p><Link href="/admin">Staff portal</Link></footer><Concierge />
  </main>;
}
