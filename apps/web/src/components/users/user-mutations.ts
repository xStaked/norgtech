export const E164_PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;

export const PHONE_VALIDATION_MESSAGE =
  "El teléfono debe tener formato internacional, por ejemplo +573001234567";

export function normalizePhoneInput(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}

export async function readErrorMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;
  if (Array.isArray(data?.message)) return data.message.join(". ");
  return data?.message ?? fallback;
}
