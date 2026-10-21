export type Service = {
  id: string;
  name: string;
  category?: string | null;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  image_url?: string | null;
};

export type Therapist = {
  id: string;
  full_name: string;
  bio: string | null;
  photo_url: string | null;
  is_active: boolean;
  therapist_services?: {
    service_id: string;
    services?: { name: string } | null;
  }[];
};

export type Settings = {
  id: string;
  spa_name: string;
  spa_email: string | null;
  spa_phone: string | null;
  spa_address: string | null;
  slot_interval_minutes: number;
  booking_notice_hours: number;
  booking_policies?: string | null;
};

export type Appointment = {
  id: string;
  service_id: string;
  therapist_id?: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  full_name: string;
  email: string;
  phone: string;
  notes?: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  payment_status?: "pending" | "paid" | "failed" | null;
  paystack_reference?: string | null;
  created_at: string;
};

export type BusinessHour = {
  id: string;
  weekday: number;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BlockedDate = {
  id: string;
  blocked_date: string;
  reason: string | null;
};
