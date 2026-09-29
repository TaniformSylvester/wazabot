/** Icon-chip colour pairs from the WazaBolt palette — the only icon tones to use. */
export const iconTones = {
  green: "bg-mint text-waza-700",
  gold: "bg-gold-100 text-gold-800",
  coral: "bg-coral-50 text-coral-700",
  deep: "bg-deep text-waza-400",
  teal: "bg-waza-100 text-waza-900",
} as const;

export type IconTone = keyof typeof iconTones;
