export const E164_PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;

export const PHONE_VALIDATION_MESSAGE =
  "El teléfono debe tener formato internacional, por ejemplo +573001234567";

export function normalizePhoneInput(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}

export const EMAIL_VALIDATION_MESSAGE =
  "Escribe un correo válido, por ejemplo nombre@empresa.com";

export function normalizeEmailInput(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmailInput(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function emailConflictMessage(status: number): string | null {
  return status === 409 ? "Ese correo ya lo tiene otra persona." : null;
}

export async function readErrorMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;
  if (Array.isArray(data?.message)) return data.message.join(". ");
  return data?.message ?? fallback;
}
