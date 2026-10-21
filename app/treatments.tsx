"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { duration, naira } from "@/lib/format";
import { extractServiceMedia } from "@/lib/service-media";
import type { Service } from "@/lib/types";

// High-quality curated Unsplash placeholders tailored to spa treatments
const TREATMENT_IMAGES: Record<string, string> = {
  // Massages
  "signature cee essence massage": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
  "swedish massage": "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=800&q=80",
  "deep tissue massage": "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
  "hot stone therapy": "https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=800&q=80",
  "hot stone massage": "https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=800&q=80",
  "aromatherapy massage": "https://images.unsplash.com/photo-1608248597359-2a9539d7bf57?auto=format&fit=crop&w=800&q=80",
  "couple's massage": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
  "couples massage": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
  "prenatal massage": "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=800&q=80",
  "relaxation massage": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
  "personalized massage": "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=800&q=80",

  // Facials
  "signature facial": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80",
  "hydrating facial": "https://images.unsplash.com/photo-1512290900672-1f55b9a896a2?auto=format&fit=crop&w=800&q=80",
  "brightening facial": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80",
  "anti-aging facial": "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=800&q=80",
  "deep cleansing facial": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80",

  // Body
  "body scrub treatment": "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=800&q=80",
  "body scrub & polish": "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=800&q=80",
  "detox body wrap": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
  "half-day pamper package": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",

  // Nails & Foot
  "signature pedicure": "https://images.unsplash.com/photo-1519014816548-bf785179c2ff?auto=format&fit=crop&w=800&q=80",
  "signature manicure": "https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=800&q=80",
  "foot reflexology": "https://images.unsplash.com/photo-1576426863848-c21f53c60b19?auto=format&fit=crop&w=800&q=80",
};

const CATEGORY_DEFAULT_IMAGE: Record<string, string> = {
  "Massage Treatments": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
  "Facial Treatments": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80",
  "Body Treatments": "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=800&q=80",
  "Hand & Foot Treatments": "https://images.unsplash.com/photo-1519014816548-bf785179c2ff?auto=format&fit=crop&w=800&q=80",
};

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80";

function getTreatmentImage(name: string, category?: string | null): string {
  const key = name.toLowerCase().trim();
  if (TREATMENT_IMAGES[key]) return TREATMENT_IMAGES[key];

  // Match keyword in name
  for (const [k, url] of Object.entries(TREATMENT_IMAGES)) {
    if (key.includes(k) || k.includes(key)) return url;
  }

  if (category && CATEGORY_DEFAULT_IMAGE[category]) {
    return CATEGORY_DEFAULT_IMAGE[category];
  }

  return DEFAULT_IMAGE;
}

export function TreatmentsSection({ services }: { services: Service[] }) {
  // Extract all categories dynamically from services
  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.category?.trim()) set.add(s.category.trim());
    });

    const list = Array.from(set);
    if (list.length === 0) {
      return ["Massage Treatments", "Facial Treatments", "Body Treatments", "Hand & Foot Treatments"];
    }
    return list;
  }, [services]);

  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Filter treatments
  const filteredServices = useMemo(() => {
    if (selectedCategory === "All") return services;
    return services.filter((s) => s.category?.trim().toLowerCase() === selectedCategory.toLowerCase());
  }, [services, selectedCategory]);

  return (
    <section id="treatments" className="treatments-container">
      {/* ── Dark Contrast Header Band ── */}
      <div className="treatments-dark-header">
        <div className="treatments-header-content">
          <span className="eyebrow" style={{ color: "var(--gold)" }}>CURATED RITUALS</span>
          <h2>Our Treatments</h2>
          <p className="treatments-subtitle">
            Browse our services and book your appointment online.
          </p>

          {/* Category Pill Buttons */}
          <div className="category-pills" role="tablist" aria-label="Treatment categories">
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "All"}
              className={`pill-btn ${selectedCategory === "All" ? "active" : ""}`}
              onClick={() => setSelectedCategory("All")}
            >
              All Treatments
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat}
                className={`pill-btn ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Treatment Cards Grid ── */}
      <div className="treatments-body">
        <div className="treatments-grid">
          {filteredServices.length === 0 ? (
            <div className="no-treatments">
              <p>No treatments found in this category.</p>
            </div>
          ) : (
            filteredServices.map((service) => {
              const { description: cleanDesc, imageUrl: customImage } = extractServiceMedia(service.description, service.image_url);
              const imageUrl = customImage || getTreatmentImage(service.name, service.category);
              return (
                <article className="boutique-card" key={service.id}>
                  <div className="boutique-card-media">
                    <Image
                      src={imageUrl}
                      alt={service.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      className="boutique-card-img"
                    />
                    <div className="boutique-card-overlay" />
                    <span className="boutique-category-badge">
                      {service.category || "Treatment"}
                    </span>
                  </div>

                  <div className="boutique-card-info">
                    <div className="boutique-card-header">
                      <h3>{service.name}</h3>
                      <p className="boutique-desc">
                        {cleanDesc || "Carefully considered restorative ritual for renewed well-being."}
                      </p>
                    </div>

                    <div className="boutique-card-footer">
                      <div className="boutique-meta">
                        <span className="boutique-price">{naira(service.price)}</span>
                        <span className="boutique-duration">
                          {duration(service.duration_minutes)}
                        </span>
                      </div>
                      <a href="#book" className="boutique-book-btn">
                        Reserve <span>→</span>
                      </a>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
