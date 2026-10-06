# Correo editable en Administracion de usuarios

## Contexto

En `/users`, visible solo para `administrador`, el correo se muestra pero no se edita. Nombre, telefono, rol y estado si se editan en la misma tabla. El `PATCH /users/:id` rechaza `email` a proposito: la primera fase del modulo dejo el correo fijo porque es la identidad de login.

Eso impide corregir un correo mal escrito o reasignar el acceso de una persona a otro buzon. El correo sigue siendo unico y es con lo que se inicia sesion. La contrasena no cambia.

## Objetivos

- Permitir que un administrador edite el correo de cualquier usuario, incluido el suyo, desde la fila de `/users`.
- Normalizar el correo igual que al crear: trim y minusculas.
- Rechazar un correo vacio, invalido o que ya pertenezca a otra persona.
- Al cambiar el correo, cerrar las sesiones abiertas de esa persona y invalidar los enlaces de restablecimiento que todavia no se usaron.
- Si el administrador cambia su propio correo, cerrar su sesion en el navegador y dejarlo en el login. Entra con el correo nuevo y la misma contrasena.

## Fuera de Alcance

- Cambiar o regenerar la contrasena.
- Enviar un aviso o un correo de restablecimiento al buzon nuevo.
- Dejar de usar el correo como identidad de login.
- Invalidar al instante el access token ya emitido. Dura hasta 15 minutos, el mismo limite que ya tiene el restablecimiento de contrasena.
- Permitir que un rol distinto de `administrador` edite usuarios.
- Cambiar las reglas actuales de rol propio y desactivacion propia.

## Diseno

### Pantalla

La accion de la fila pasa de "Editar nombre y telefono" a "Editar datos". Mientras la fila esta en edicion, el correo es un campo, igual que el telefono.

Al salir del campo se normaliza el valor (trim y minusculas):

- Si queda igual al correo actual, no se guarda nada y no aparece aviso.
- Si esta vacio o no tiene forma de correo (texto, `@`, texto, sin espacios), no aparece el aviso y no se llama al API. El campo marca el error y conserva lo escrito. La validacion de formato del API (`@IsEmail()`, la misma del alta) sigue siendo la autoridad: un 400 tambien devuelve el campo al correo anterior y muestra el mensaje del API.
- Si cambio y es valido, aparece el mismo tipo de confirmacion que al eliminar un usuario (`window.confirm`).

Texto cuando se edita a otra persona:

> {nombre} tendra que volver a iniciar sesion con {correo nuevo}. El correo anterior deja de servir para entrar.

Texto cuando el administrador edita el suyo:

> Vas a cambiar tu correo a {correo nuevo}. Tendras que volver a iniciar sesion y el correo anterior dejara de servir para entrar.

Si cancela, el campo vuelve al correo anterior. Si confirma, se envia solo `{ email }` en el `PATCH /users/:id` que ya usa la tabla.

### API

`UpdateUserDto` acepta `email` opcional, con la misma validacion de formato que el alta. `passwordHash` sigue rechazado.

`UsersService.update` solo trata el correo si viene en el payload:

- Lo normaliza con trim y minusculas, igual que `create`.
- Si despues de normalizar es igual al actual, no lo escribe y no toca sesiones.
- Si es distinto, actualiza el usuario y, en la misma transaccion, revoca los refresh tokens abiertos de ese `userId` (`revokedAt`) e invalida los `PasswordResetToken` sin usar (`usedAt`). Un enlace enviado al correo anterior deja de servir para cambiar la clave.
- Si el correo ya existe, responde 409 con el mismo conflicto que el alta (`Email already exists`) y no modifica al usuario.
- Un correo invalido responde 400.
- Cambiar el propio correo esta permitido. Cambiar el propio rol o desactivarse sigue prohibido.

No hay migracion. `User.email` ya existe y es unico.

### Cierre de sesion

Para otra persona, el cierre es de servidor: sus refresh tokens quedan revocados. La proxima renovacion falla y el cliente la manda al login. Una pestana que ya tenia access token puede seguir hasta 15 minutos.

Para el propio administrador, ademas del cierre de servidor:

- Despues de un guardado exitoso se llama a `POST /auth/logout` para limpiar la cookie httpOnly de refresh.
- Se borra la cookie de sesion del navegador, igual que "Cerrar sesion".
- Se redirige a `/login`.
- Si el logout del navegador falla, igual se borra la cookie local y se redirige. En el servidor las sesiones ya quedaron revocadas.

### Errores en pantalla

Si el API rechaza el cambio, el campo vuelve al correo anterior y un toast muestra el motivo:

- 409: "Ese correo ya lo tiene otra persona." El cliente traduce ese 409; no muestra el mensaje en ingles del API.
- 404: el usuario ya no existe, con el mensaje que ya devuelve el API.
- Fallo de red: el toast de conexion que ya usa la tabla.

## Pruebas

Cubrir el riesgo en el e2e de usuarios:

- Un administrador cambia el correo de otra persona: se guarda en minusculas, se revocan sus refresh tokens y se invalidan sus enlaces de restablecimiento sin usar.
- Enviar el mismo correo, aunque cambie mayusculas o espacios, no revoca sesiones.
- Un correo duplicado responde 409 y no modifica al usuario.
- Un correo invalido responde 400.
- `passwordHash` sigue rechazado.
- Un administrador puede cambiar su propio correo y eso tambien revoca sus sesiones. Sigue sin poder cambiarse el rol ni desactivarse.

No se agrega una prueba de pantalla. El aviso, el campo y la redireccion siguen el patron que ya tiene la tabla.

## Limite conocido

Revocar refresh tokens no invalida un access token ya emitido. Quien tenga una pestana abierta puede seguir usandola hasta 15 minutos. No se introduce una lista de tokens revocados para este cambio.
