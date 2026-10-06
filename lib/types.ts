export type Service = { id: string; name: string; description: string | null; duration_minutes: number; price: number; is_active: boolean };
export type Therapist = { id: string; full_name: string; bio: string | null; photo_url: string | null; is_active: boolean; therapist_services?: { service_id: string; services?: { name: string } | null }[] };
export type Settings = { id: string; spa_name: string; spa_email: string | null; spa_phone: string | null; spa_address: string | null; slot_interval_minutes: number; booking_notice_hours: number };
