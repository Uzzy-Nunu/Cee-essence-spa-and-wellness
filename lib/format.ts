export const naira = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
export const duration = (mins: number) => mins >= 60 ? `${mins / 60} ${mins === 60 ? "hr" : "hrs"}` : `${mins} min`;
export const timeLabel = (time: string) => new Date(`1970-01-01T${time}`).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
