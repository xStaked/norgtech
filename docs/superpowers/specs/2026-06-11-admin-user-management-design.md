# Modulo Admin de Manejo de Usuarios

## Contexto

Norgtech CRM ya cuenta con autenticacion JWT, roles en Prisma (`UserRole`) y un modelo `User` con `name`, `email`, `passwordHash`, `role`, `active`, `createdAt` y `updatedAt`. La navegacion web filtra modulos por rol y el backend protege endpoints con `JwtAuthGuard`, `RolesGuard` y el decorador `@Roles`.

Actualmente no existe un modulo dedicado para administrar usuarios desde la aplicacion. La creacion de usuarios ocurre por seed o intervencion directa en base de datos. El objetivo de esta primera fase es habilitar una gestion operativa basica para el rol `administrador`.

## Objetivos

- Permitir que un usuario `administrador` vea la lista de usuarios del sistema.
- Permitir crear usuarios desde la UI con nombre, email y rol.
- Generar una contrasena temporal en backend y mostrarla una sola vez al crear el usuario.
- Permitir editar nombre, rol y estado activo de usuarios existentes.
- Evitar que el administrador autenticado se quite acceso accidentalmente cambiando su propio rol o desactivandose.
- Mantener la implementacion alineada con los patrones actuales de NestJS, Prisma, Next.js y helpers API existentes.

## Fuera de Alcance

- Recuperacion de contrasena por email.
- Cambio de contrasena autogestionado por cada usuario.
- Auditoria detallada de cambios de usuario.
- Permisos granulares por modulo o accion.
- Invitaciones por correo o onboarding automatizado.
- Eliminacion fisica de usuarios.

## Enfoque Elegido

Se implementara un MVP administrativo directo:

- Nuevo modulo API `UsersModule`.
- Nueva ruta web `/users` visible solo para `administrador`.
- CRUD parcial: listar, crear y actualizar campos operativos.
- Estado `active` como mecanismo de deshabilitacion, sin borrar registros.
- Contrasena temporal generada por backend y devuelta solamente en la respuesta de creacion.

Este enfoque entrega valor operativo real sin ampliar innecesariamente la superficie de seguridad.

## Backend

### Modulo

Crear `apps/api/src/modules/users` con:

- `users.module.ts`
- `users.controller.ts`
- `users.service.ts`
- `dto/create-user.dto.ts`
- `dto/update-user.dto.ts`

Registrar `UsersModule` en `apps/api/src/app.module.ts`.

### Endpoints

Todos los endpoints usan `JwtAuthGuard`, `RolesGuard` y `@Roles("administrador")`.

#### `GET /users`

Lista todos los usuarios ordenados por `name` ascendente.

Respuesta por usuario:

- `id`
- `name`
- `email`
- `role`
- `active`
- `createdAt`
- `updatedAt`

Nunca retorna `passwordHash`.

#### `POST /users`

Crea un usuario.

Payload:

- `name`: string requerido.
- `email`: email requerido.
- `role`: `UserRole` requerido.

Comportamiento:

- Normaliza email con trim/lowercase.
- Valida unicidad por email.
- Genera una contrasena temporal segura en backend.
- Hashea la contrasena con `bcryptjs`.
- Crea el usuario como `active: true`.

Respuesta:

- `user`: datos publicos del usuario creado.
- `temporaryPassword`: contrasena temporal en texto claro, disponible solo en esta respuesta.

#### `PATCH /users/:id`

Actualiza datos operativos.

Payload parcial:

- `name`
- `role`
- `active`

Reglas:

- Si el `id` corresponde al usuario autenticado, rechazar cambios de `role`.
- Si el `id` corresponde al usuario autenticado, rechazar `active: false`.
- Si el usuario objetivo no existe, retornar 404.
- Nunca permitir actualizar `email` ni `passwordHash` en esta fase.

## Frontend

### Navegacion

Agregar un item `/users` visible solo para `administrador`.

Crear un grupo nuevo `Admin` en la navegacion y agregar ahi el item `Usuarios`.

El acceso visual debe coincidir con `canAccess` en `apps/web/src/lib/auth.ts`.

### Pagina `/users`

Crear una pagina en `apps/web/src/app/(app)/users/page.tsx`.

La primera version puede usar una pagina server-side para cargar la lista con `apiFetch("/users")` y componentes cliente para acciones de creacion/edicion.

Contenido esperado:

- Encabezado `Usuarios`.
- Boton `Nuevo usuario`.
- Tabla o lista con nombre, email, rol, estado y ultima actualizacion.
- Accion para editar nombre, rol y estado.
- Indicador visual de usuarios inactivos.

### Creacion

Formulario con:

- Nombre.
- Email.
- Rol.

Despues de crear:

- Refrescar la lista.
- Mostrar un panel con la contrasena temporal generada.
- Indicar que esa contrasena solo se muestra una vez.

### Edicion

La edicion puede ser inline o en un formulario compacto/modal, siguiendo los componentes UI existentes.

Para el usuario autenticado:

- Deshabilitar cambio de rol.
- Deshabilitar desactivacion.
- Mostrar una explicacion breve: `No puedes quitar tu propio acceso de administrador desde aqui.`

## Seguridad y Datos

- El backend es la fuente de verdad para permisos; la UI solo mejora la experiencia.
- Los endpoints de usuarios son exclusivos para `administrador`.
- La contrasena temporal no se persiste en texto claro.
- `passwordHash` nunca sale del backend.
- No se elimina informacion historica ni relaciones; usuarios se inactivan con `active`.
- El login actual ya rechaza usuarios inactivos, por lo que desactivar usuarios bloquea acceso futuro.

## Manejo de Errores

- Email duplicado: 409 Conflict con mensaje claro.
- Usuario inexistente: 404 Not Found.
- Intento de auto-desactivacion: 400 Bad Request.
- Intento de auto-cambio de rol: 400 Bad Request.
- Payload invalido: 400 Bad Request por `ValidationPipe`.
- Rol no administrador: 403 Forbidden por `RolesGuard`.

## Pruebas

### API

Agregar pruebas e2e enfocadas en `UsersModule`:

- `administrador` puede listar usuarios.
- rol no administrador recibe 403 en `GET /users`.
- `administrador` puede crear usuario y recibe `temporaryPassword`.
- respuesta de creacion/lista no contiene `passwordHash`.
- la contrasena temporal permite login del usuario creado.
- email duplicado retorna 409.
- `administrador` puede actualizar nombre, rol y estado de otro usuario.
- `administrador` no puede cambiar su propio rol.
- `administrador` no puede desactivarse.

### Web

Agregar cobertura segun el patron existente:

- administrador ve el item de navegacion `Usuarios`.
- otros roles no ven el item.
- creacion muestra contrasena temporal una sola vez.
- acciones bloqueadas para el usuario actual se renderizan deshabilitadas.

## Criterios de Aceptacion

- Un administrador puede entrar a `/users`, ver usuarios existentes y crear un usuario nuevo.
- La contrasena temporal se genera en backend y aparece solo tras la creacion.
- El usuario creado puede iniciar sesion con la contrasena temporal.
- Un administrador puede cambiar nombre, rol y estado de otros usuarios.
- Un administrador no puede cambiar su propio rol ni desactivarse.
- Ninguna respuesta API expone `passwordHash`.
- Usuarios no administradores no pueden acceder al modulo ni a sus endpoints.
