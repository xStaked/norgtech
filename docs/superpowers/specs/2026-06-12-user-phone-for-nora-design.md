# Telefono de Usuarios para Nora

## Contexto

El modulo admin de usuarios permite crear, listar y editar usuarios, pero el modelo `User` no guarda telefono. Para habilitar uso posterior de Nora por WhatsApp, cada usuario necesita un numero telefonico normalizado.

Nora y los modulos de WhatsApp ya trabajan con telefonos en clientes, contactos y conversaciones. El dato faltante es el telefono del usuario interno.

## Objetivos

- Agregar `phone` al modelo `User`.
- Guardar telefonos en formato internacional, por ejemplo `+573001234567`.
- Permitir que admins creen usuarios con telefono desde `/users`.
- Permitir que admins editen el telefono de usuarios existentes desde `/users`.
- Exponer `phone` en las respuestas publicas de `/users`.
- Sembrar telefonos demo para los usuarios del seed.
- Mantener `phone` opcional en base de datos para no romper usuarios existentes.

## Fuera de Alcance

- Integrar automaticamente Nora con el telefono del usuario.
- Soportar multiples telefonos por usuario.
- Verificar numeros por SMS o WhatsApp.
- Cambiar el login, JWT o `auth/me`.
- Hacer telefono unico globalmente.

## Diseno

### Base de Datos

Agregar `phone String?` al modelo `User` en Prisma.

Crear una migracion que agregue la columna nullable:

```sql
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
```

La columna queda nullable para compatibilidad con usuarios existentes.

### Validacion

El formato aceptado es internacional simple:

```text
^\+[1-9]\d{9,14}$
```

Esto permite telefonos con `+`, codigo de pais y 10 a 15 digitos en total despues del primer digito. No se aceptan espacios, guiones ni parentesis. La UI puede mostrar el ejemplo visual `+573001234567`.

### API

Actualizar `UsersService`:

- Incluir `phone` en `publicUserSelect`.
- En `create`, guardar `phone: dto.phone.trim()`.
- En `update`, permitir `phone` si viene en payload.

Actualizar DTOs:

- `CreateUserDto.phone`: requerido, string, regex internacional.
- `UpdateUserDto.phone`: opcional, string, regex internacional.

No se cambia el comportamiento de contrasena temporal ni protecciones de auto-desactivacion/auto-cambio de rol.

### Seed

Agregar telefonos demo a los seis usuarios actuales:

- Administrador
- Director comercial
- Comercial
- Tecnico
- Facturacion
- Logistica

Los telefonos deben ser ficticios pero validos segun el regex.

### Frontend

Actualizar `ManagedUser` con `phone: string | null`.

En `/users`:

- Formulario de creacion: agregar campo `Telefono` requerido.
- Tabla: agregar columna `Telefono`.
- Edicion: permitir editar telefono por usuario, idealmente con el mismo patron de blur que nombre.
- Placeholder: `+573001234567`.

El telefono debe enviarse en `POST /users` y `PATCH /users/:id`.

## Manejo de Errores

- Telefono invalido en create/update retorna 400 por `ValidationPipe`.
- Fallas de API se muestran con los mecanismos existentes de error del formulario/pagina.

## Pruebas

### API

Actualizar `apps/api/test/users.e2e-spec.ts`:

- Crear usuario con telefono y verificar que la respuesta lo incluye.
- Listar usuarios y verificar que `phone` aparece en cada usuario publico.
- Editar telefono con `PATCH /users/:id`.
- Rechazar telefono invalido en `POST /users`.
- Rechazar telefono invalido en `PATCH /users/:id`.
- Mantener assertions de no exposicion de `passwordHash`.

### Web

Validar con build:

- `ManagedUser` compila con `phone`.
- Formulario de creacion envia `phone`.
- Tabla muestra y permite editar `phone`.

## Criterios de Aceptacion

- `User` tiene columna nullable `phone`.
- Admin puede crear usuarios con telefono internacional desde `/users`.
- Admin puede editar telefono de usuarios existentes desde `/users`.
- `/users` API lista, crea y actualiza `phone`.
- Telefonos invalidos se rechazan con 400.
- Tests API enfocados pasan.
- Build web pasa.
