// ponytail: Resend es un POST; no hace falta el SDK. Si algún día se necesitan
// adjuntos, batch o webhooks de entrega, ahí sí instalar `resend`.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Norgtech <no-reply@norgtech.co>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPasswordResetEmail(params: {
  name: string;
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}): string {
  const name = escapeHtml(params.name.trim().split(/\s+/)[0] ?? "");
  const email = escapeHtml(params.email);
  const url = escapeHtml(params.resetUrl);
  const minutes = params.expiresInMinutes;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Restablece tu contraseña de Norgtech</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  @media (max-width: 620px) {
    .wrap { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef1f4;">
<span style="display:none;font-size:1px;color:#eef1f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Recibimos una solicitud para restablecer tu contraseña. El enlace expira en ${minutes} minutos.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef1f4;">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="wrap" style="width:600px;max-width:600px;">

<!-- header -->
<tr><td style="padding:0 0 16px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td width="36" height="36" align="center" valign="middle" bgcolor="#0c2c44" style="width:36px;height:36px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;mso-line-height-rule:exactly;line-height:36px;">N</td>
<td style="padding-left:10px;font-family:Arial,Helvetica,sans-serif;">
<span style="font-size:18px;font-weight:bold;color:#0c2c44;letter-spacing:-0.5px;">norgtech</span><br>
<span style="font-size:9px;font-weight:bold;color:#7a8696;letter-spacing:1px;">ERP COMERCIAL</span>
</td>
</tr>
</table>
</td></tr>

<!-- card -->
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:12px;border:1px solid #e3e6eb;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

<!-- brand spectrum bar -->
<tr>
<td height="4" width="17%" bgcolor="#00a651" style="height:4px;font-size:1px;line-height:1px;border-radius:12px 0 0 0;">&nbsp;</td>
<td height="4" width="17%" bgcolor="#a7ce39" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
<td height="4" width="17%" bgcolor="#0288c4" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
<td height="4" width="17%" bgcolor="#ffcb06" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
<td height="4" width="16%" bgcolor="#f58221" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
<td height="4" width="16%" bgcolor="#ee1c25" style="height:4px;font-size:1px;line-height:1px;border-radius:0 12px 0 0;">&nbsp;</td>
</tr>

<tr><td colspan="6" class="px" style="padding:36px 44px 40px 44px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:bold;color:#0c2c44;letter-spacing:-0.4px;mso-line-height-rule:exactly;line-height:30px;">Restablece tu contraseña</td></tr>
<tr><td style="padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#3a4658;mso-line-height-rule:exactly;line-height:22px;">
Hola ${name},<br><br>
Recibimos una solicitud para restablecer la contraseña de tu cuenta <strong style="color:#0c2c44;">${email}</strong>. Haz clic en el botón para crear una nueva contraseña:
</td></tr>

<!-- bulletproof button -->
<tr><td align="center" style="padding:28px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="#0f5c8a" style="border-radius:9px;">
<a href="${url}" style="display:block;padding:14px 38px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;mso-line-height-rule:exactly;line-height:18px;">Crear nueva contraseña</a>
</td></tr>
</table>
</td></tr>

<!-- expiry notice -->
<tr><td bgcolor="#fdf0dc" style="background-color:#fdf0dc;border-radius:8px;padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9a6410;mso-line-height-rule:exactly;line-height:19px;">
&#9200;&nbsp; Por seguridad, este enlace expira en <strong>${minutes} minutos</strong> y solo puede usarse una vez.
</td></tr>

<tr><td style="padding-top:24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7787;mso-line-height-rule:exactly;line-height:20px;">
Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
<a href="${url}" style="color:#0f5c8a;word-break:break-all;">${url}</a>
</td></tr>

<tr><td style="padding-top:24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding-top:24px;border-top:1px solid #eef1f6;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7787;mso-line-height-rule:exactly;line-height:20px;">
¿No solicitaste este cambio? Puedes ignorar este correo — tu contraseña seguirá siendo la misma. Si crees que alguien intentó acceder a tu cuenta, <a href="mailto:soporte@norgtech.co" style="color:#0f5c8a;font-weight:bold;">contacta a soporte</a>.
</td></tr>
</table>
</td></tr>

</table>
</td></tr>
</table>
</td></tr>

<!-- footer -->
<tr><td align="center" style="padding:24px 20px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#8a93a1;mso-line-height-rule:exactly;line-height:18px;">
Este es un correo transaccional de seguridad enviado por Norgtech.<br>
Norgtech S.A.S. · Carrera 43A #16A-38, Medellín, Colombia<br>
<a href="mailto:soporte@norgtech.co" style="color:#8a93a1;">Soporte</a>
</td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

/** Lanza si Resend rechaza el envío; el caller decide si lo propaga. */
export async function sendPasswordResetEmail(params: {
  name: string;
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no está configurada");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [params.email],
      subject: "Restablece tu contraseña de Norgtech",
      html: renderPasswordResetEmail(params),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend respondió ${response.status}: ${await response.text().catch(() => "")}`,
    );
  }
}
