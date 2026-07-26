/**
 * Avatares de iniciales con color estable: el mismo nombre siempre cae en el
 * mismo color, en cualquier pantalla y entre recargas.
 */
const AVATAR_COLORS = [
  "#0f5c8a",
  "#167c4a",
  "#6d4ff0",
  "#b8690f",
  "#b42318",
  "#0288c4",
  "#7a5cff",
  "#0a7d6b",
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
