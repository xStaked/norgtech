/**
 * Allowlist comun para soportes de archivo (facturas y gastos comerciales):
 * imagenes de comprobante y PDF, maximo 10MB. Multer (fileFilter/limits) y los
 * servicios (defensa en profundidad antes del upload) deben usar estas mismas
 * constantes para no divergir.
 */
export const SUPPORT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const SUPPORT_FILE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
