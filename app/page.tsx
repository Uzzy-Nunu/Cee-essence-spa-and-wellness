import Image from "next/image";
import Link from "next/link";
import { Booking } from "./booking";
import { Concierge } from "./chat";
import { CeeEssenceLogo } from "./logo";
import { WaterStream } from "./water-stream";
import { TreatmentsSection } from "./treatments";
import { MobileNav } from "./mobile-nav";
import { adminSupabase } from "@/lib/supabase-admin";
import { timeLabel } from "@/lib/format";
import type { BlockedDate, BusinessHour, Service, Settings, Therapist } from "@/lib/types";

export const dynamic = "force-dynamic";

const FALLBACK_SPA_INFO = {
  spa_name: "Cee Essence Spa & Wellness",
  spa_email: "hello@ceeessencespa.com",
  spa_phone: "+234 800 CEE-SPA1",
  spa_address: "Shop P8, The Bints Centre by Haimbridge, Abuja, Nigeria",
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Home() {
  const db = adminSupabase();
  const [
    { data: servicesData },
    { data: therapistsData },
    { data: settingData },
    { data: businessHoursData },
    { data: blockedDatesData },
  ] = await Promise.all([
    db.from("services").select("*").eq("is_active", true).order("category").order("price"),
    db.from("therapists").select("*, therapist_services(service_id,services(name))").eq("is_active", true),
    db.from("spa_settings").select("*").limit(1).maybeSingle(),
    db.from("business_hours").select("*").order("weekday", { ascending: true }),
    db.from("blocked_dates").select("*").order("blocked_date", { ascending: true }),
  ]);

  const services = (servicesData as Service[]) ?? [];
  const dbTherapists = (therapistsData as Therapist[]) ?? [];
  const info = { ...FALLBACK_SPA_INFO, ...settingData } as Settings & typeof FALLBACK_SPA_INFO;
  const hoursList = (businessHoursData as BusinessHour[]) ?? [];
  const blockedDates = (blockedDatesData as BlockedDate[]) ?? [];

  // ONLY show therapists from the admin dashboard — strictly no placeholder therapists
  const displayTherapists = dbTherapists.map((t) => ({
    id: t.id,
    full_name: t.full_name,
    bio: t.bio || "Dedicated wellness therapist providing personalized, restorative care.",
    photo_url: t.photo_url || "https://images.unsplash.com/photo-1594824813583-8a620b7ee2e1?auto=format&fit=crop&w=700&q=80",
    specialties:
      t.therapist_services?.map((s) => s.services?.name).filter(Boolean).join(" · ") || "",
  }));

  return (
    <main>
      {/* ──────────────────────────────────────────────────────────
          01. NAVIGATION (Real logo without background, all page links, hover animation)
      ────────────────────────────────────────────────────────── */}
      <nav>
        <Link href="#home" className="nav-brand" aria-label="Cee Essence Home">
          <CeeEssenceLogo variant="light" size="sm" />
        </Link>

        <div className="navlinks">
          <a href="#story">Our Story</a>
          <a href="#treatments">Treatments</a>
          <a href="#therapists">Therapists</a>
          <a href="#book">Book Appointment</a>
        </div>

        <a className="nav-btn" href="#book">
          Reserve a session
        </a>

        <MobileNav />
      </nav>

      {/* ──────────────────────────────────────────────────────────
          02. HERO / LANDING (Boutique spa, uncluttered, no floating trust card)
      ────────────────────────────────────────────────────────── */}
      <section id="home" className="hero">
        <Image
          priority
          fill
          sizes="100vw"
          src="/hero-spa-luxury.jpg"
          alt="Cee Essence luxury boutique spa interior"
          style={{ objectPosition: "center 40%" }}
        />
        <div className="hero-shade" />

        <div className="hero-copy">
          <span className="eyebrow">ABUJA · REFINED WELLNESS</span>
          <h1>
            Return to your<br />
            <i>natural rhythm.</i>
          </h1>
          <p>
            Thoughtful treatments, unhurried moments, and a serene boutique space made for your complete restoration.
          </p>
          <a className="button" href="#book">
            Book your treatment <span>→</span>
          </a>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          WATER STREAM: Hero → Our Story
      ────────────────────────────────────────────────────────── */}
      <WaterStream variant="hero-to-story" />

      {/* ──────────────────────────────────────────────────────────
          03. OUR STORY SECTION (Exact requested copy)
      ────────────────────────────────────────────────────────── */}
      <section id="story" className="story-section">
        <div className="story-container">
          <div className="story-top">
            <span className="eyebrow">THE CEE ESSENCE WAY</span>
            <h2>
              Beauty meets<br />
              <i>refined wellness.</i>
            </h2>
          </div>

          <div className="story-body">
            <p className="story-lead">
              At Cee Essence, we believe restoration shouldn&apos;t be rushed. Every space, every ritual, every hour is shaped around one idea: that you deserve care that is considered down to the smallest detail.
            </p>

            <p className="story-narrative">
              We start with a simple question — what would it feel like to be truly tended to? Not processed through a routine, but met exactly where you are. That question shapes everything we do, from the therapists we train to the ambience of the room you&apos;ll walk into. We give you wellness, done with intention.
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          WATER STREAM: Our Story → Treatments
      ────────────────────────────────────────────────────────── */}
      <WaterStream variant="story-to-treatments" />

      {/* ──────────────────────────────────────────────────────────
          04. TREATMENTS (Dark header band, category pills, cards)
      ────────────────────────────────────────────────────────── */}
      <TreatmentsSection services={services} />

      {/* ──────────────────────────────────────────────────────────
          WATER STREAM: Treatments → Therapists
      ────────────────────────────────────────────────────────── */}
      <WaterStream variant="treatments-to-therapists" />

      {/* ──────────────────────────────────────────────────────────
          05. THERAPISTS (Reduced size, real therapist placeholders)
      ────────────────────────────────────────────────────────── */}
      <section id="therapists" className="therapists-section">
        <div className="therapists-wrapper">
          <div className="therapist-title">
            <span className="eyebrow" style={{ color: "var(--gold)" }}>THE HANDS BEHIND YOUR CARE</span>
            <h2>
              Meet your<br />
              <i>therapists.</i>
            </h2>
          </div>

          <div className="therapist-list">
            {displayTherapists.map((therapist) => (
              <article className="therapist-card" key={therapist.id}>
                <div className="therapist-avatar-wrap">
                  <div className="therapist-avatar">
                    <Image
                      fill
                      sizes="120px"
                      src={therapist.photo_url}
                      alt={therapist.full_name}
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                </div>
                <h3>{therapist.full_name}</h3>
                <p>{therapist.bio}</p>
                {therapist.specialties && <small>{therapist.specialties}</small>}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          WATER STREAM: Therapists → Booking
      ────────────────────────────────────────────────────────── */}
      <WaterStream variant="therapists-to-booking" />

      {/* ──────────────────────────────────────────────────────────
          06. APPOINTMENT BOOKING (Left as it currently is)
      ────────────────────────────────────────────────────────── */}
      <section id="book" className="booking-section">
        <span className="eyebrow">YOUR APPOINTMENT</span>
        <h2>
          Reserve your<br />
          <i>session.</i>
        </h2>
        <Booking
          services={services}
          therapists={dbTherapists}
          businessHours={hoursList}
          blockedDates={blockedDates}
          bookingPolicies={info.booking_policies || null}
        />
      </section>

      {/* ──────────────────────────────────────────────────────────
          WATER STREAM: Booking → Footer
      ────────────────────────────────────────────────────────── */}
      <WaterStream variant="booking-to-footer" />

      {/* ──────────────────────────────────────────────────────────
          07. COMPACT BOUTIQUE FOOTER (Real Cee Essence product info)
      ────────────────────────────────────────────────────────── */}
      <footer className="boutique-footer">
        <div className="footer-inner">
          <div className="footer-top">
            {/* Brand column */}
            <div className="footer-col">
              <CeeEssenceLogo variant="light" size="sm" />
              <p style={{ marginTop: "14px" }}>
                Where beauty meets refined wellness. A sanctuary dedicated to private, considered care in Abuja.
              </p>
              <p className="footer-policies-note">
                Notice: 2-hour minimum booking notice.<br />
                A 50% deposit secures your booking; the balance payment is due at the spa.
              </p>
            </div>

            {/* Location & Contact */}
            <div className="footer-col">
              <h4>Sanctuary Location</h4>
              <p>{info.spa_address}</p>
              <p>
                <a href={`tel:${info.spa_phone}`}>{info.spa_phone}</a>
                <a href={`mailto:${info.spa_email}`}>{info.spa_email}</a>
              </p>
            </div>

            {/* Opening Hours */}
            <div className="footer-col">
              <h4>Opening Hours</h4>
              {hoursList.length > 0 ? (
                hoursList.slice(0, 7).map((h) => (
                  <p key={h.weekday} style={{ margin: "2px 0", fontSize: "11.5px" }}>
                    <span style={{ color: "#d8cdba" }}>{WEEKDAY_NAMES[h.weekday]}:</span>{" "}
                    {h.is_open && h.start_time && h.end_time ? (
                      `${timeLabel(h.start_time)} – ${timeLabel(h.end_time)}`
                    ) : (
                      <span style={{ color: "var(--gold)" }}>Closed</span>
                    )}
                  </p>
                ))
              ) : (
                <>
                  <p>Mon – Sat: 10:00am – 8:00pm</p>
                  <p>Sunday: 12:00pm – 6:00pm</p>
                </>
              )}
            </div>

            {/* Quick Links */}
            <div className="footer-col">
              <h4>Navigation</h4>
              <a href="#home">Home</a>
              <a href="#story">Our Story</a>
              <a href="#treatments">Treatments</a>
              <a href="#therapists">Therapists</a>
              <a href="#book">Book Appointment</a>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {info.spa_name}. All rights reserved.
            </span>
            <Link href="/admin">Staff portal</Link>
          </div>
        </div>
      </footer>

      {/* AI Wellness Concierge Assistant */}
      <Concierge />
    </main>
  );
}
