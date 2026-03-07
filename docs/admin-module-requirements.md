# Modulo Admin - Requerimientos Iniciales (MVP)

## Objetivo
Habilitar un modulo de administracion para operar la plataforma AquaData a nivel global (no solo por granja), con controles de acceso por rol y herramientas para soporte operativo/comercial.

## Roles
- `operario`: usuario productor, acceso al modulo actual `/dashboard`.
- `admin`: acceso al modulo `/admin` y permisos globales de lectura/escritura sobre datos operativos definidos.

## Alcance MVP (Fase 1)
1. Control de acceso por rol.
2. Dashboard admin con metricas globales.
3. Listado global de granjas (organizaciones) y productores.
4. Gestion basica de codigos de invitacion.
5. Navegacion separada entre productor y admin.

## Historias de Usuario MVP
1. Como admin, quiero entrar a `/admin` y ver un resumen global de la plataforma.
2. Como admin, quiero saber cuantas granjas, productores, estanques y lotes activos existen.
3. Como admin, quiero ver los ultimos productores registrados para seguimiento de onboarding.
4. Como admin, quiero crear codigos de invitacion para nuevos clientes.
5. Como productor, no debo poder acceder a rutas ni data del modulo admin.

## Requerimientos Funcionales
- RF-01: El sistema debe validar rol en servidor para toda ruta bajo `/admin`.
- RF-02: El sidebar debe mostrar entrada Admin solo para roles administrativos.
- RF-03: El panel admin debe mostrar KPIs globales basados en BD.
- RF-04: El panel admin debe mostrar tabla simple de ultimos usuarios registrados.
- RF-05: El panel admin debe permitir generar un codigo de invitacion y registrarlo en `invitation_codes`.

## Requerimientos No Funcionales
- RNF-01: Todo acceso admin debe respetar RLS en Supabase.
- RNF-02: El modulo debe mantener tiempos de carga razonables (queries en paralelo).
- RNF-03: Si falla una query parcial, la UI no debe romperse completamente.

## Dependencias Tecnicas
- Tabla `profiles` con campo `role`.
- Politicas RLS para habilitar alcance global cuando `role = 'admin'`.
- App Router Next.js para layout protegido de `/admin`.

## Roadmap Sugerido
- Fase 1 (ahora): base tecnica + dashboard admin + codigos de invitacion.
- Fase 2: CRUD de organizaciones y usuarios (activar/desactivar, cambio de rol).
- Fase 3: auditoria (logs), tickets de soporte, exportaciones y reportes financieros.
