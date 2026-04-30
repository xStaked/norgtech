# Laura - Asistente Comercial Conversacional

Fecha: 2026-04-30

## Objetivo

Disenar una experiencia conversacional dentro del CRM para que el comercial pueda reportar visitas, reuniones y seguimientos en lenguaje natural, sin depender de formularios largos ni de seleccionar previamente cliente u oportunidad.

La meta principal es reducir friccion de adopcion y convertir reportes informales en memoria comercial estructurada para el equipo y la gerencia.

## Problema a resolver

Hoy el seguimiento comercial ocurre principalmente por reuniones y WhatsApp, sin registro consistente en el CRM.

Esto genera varios problemas:

- el comercial siente que registrar en CRM es trabajo duplicado
- el gerente depende de preguntar o revisar chats sueltos
- se pierde contexto historico por cuenta
- no queda claro cual es el siguiente paso
- la agenda operativa del comercial no tiene una capa inteligente de priorizacion

## Propuesta

Construir `Laura`, una asistente comercial con tono calido y acompanante que:

- conversa de forma natural con el comercial
- interpreta reportes libres en texto
- pregunta cuando hay ambiguedad antes de guardar
- organiza la informacion en bloques editables
- permite guardar parcialmente los resultados correctos
- tambien responde consultas operativas sobre pendientes y agenda del dia

Laura no se presenta como IA. Se presenta como una asistente del CRM.

## Principios de producto

### 1. Cero friccion inicial

El comercial no debe escoger cliente, oportunidad ni tipo de registro antes de escribir.

La experiencia principal empieza con una caja libre de texto tipo:

- "Cuentame que paso"
- "Reporta tu visita o seguimiento"

### 2. Conversacion real, no bot de opciones

Laura debe responder de forma natural y breve.

No debe sentirse como menu guiado ni como formulario encubierto.

### 3. Confirmacion antes de guardar

Si Laura no esta segura del cliente, la oportunidad, la fecha o la intencion, debe preguntar antes de persistir.

No debe inventar contexto silenciosamente.

### 4. Control del comercial

El comercial puede:

- editar campos detectados
- descartar bloques individuales
- guardar solo una parte de lo sugerido

### 5. Valor operativo diario

Laura no solo captura reportes. Tambien ayuda a revisar la agenda del dia y a priorizar pendientes existentes.

## Casos de uso V1

### Reporte libre post-visita o post-reunion

Ejemplo:

`Estuve con Agropecuaria Lara, quieren propuesta para 2 galpones, les preocupa el costo inicial y debo hablar con compras el martes.`

Laura debe poder:

- detectar cliente o proponer opciones si hay ambiguedad
- generar resumen de la interaccion
- identificar oportunidad asociada o sugerir una nueva
- proponer siguiente paso
- proponer fecha de seguimiento
- detectar objeciones o riesgo
- crear tarea si aplica

### Consulta operativa del dia

Ejemplos:

- `Que tengo pendiente hoy`
- `Que debo mover primero`
- `Como tengo el dia`

Laura debe responder con agenda operativa priorizada basada en pendientes ya existentes.

En V1 no crea pendientes nuevos por iniciativa propia. Solo prioriza y resume lo ya registrado.

### Conversacion con memoria de sesion

Laura debe sostener contexto dentro de la misma sesion.

Ejemplos:

- `si, con ese mismo cliente`
- `mejor pasalo para el jueves`
- `no actualices la oportunidad`
- `agregale que el problema fue precio`

## Puntos de entrada

### 1. Pantalla principal de reporte

Una vista dedicada para escribir sin contexto previo.

Es el punto de entrada principal para adopcion, porque replica mejor el comportamiento actual del comercial.

### 2. Entrada contextual en cliente

Dentro de la ficha del cliente debe existir acceso a Laura para reportar o consultar contexto.

### 3. Entrada contextual en oportunidad

Dentro de la ficha de oportunidad debe existir acceso a Laura.

El contexto abierto en pantalla funciona como pista fuerte, pero Laura puede sugerir otro cliente u oportunidad si detecta que el mensaje habla de una cuenta distinta.

## Flujo principal de interaccion

### Paso 1. Entrada libre

El comercial escribe un mensaje natural.

### Paso 2. Interpretacion

Laura intenta resolver:

- cliente
- contacto
- oportunidad existente o nueva
- tipo de interaccion
- resultado comercial
- siguiente paso
- fecha o ventana temporal
- tarea derivada
- objeciones o riesgo

### Paso 3. Aclaracion si hace falta

Si existe ambiguedad critica, Laura pregunta solo lo necesario.

Ejemplo:

`No estoy segura de cual cliente es. Te refieres a Agropecuaria Lara o Lara Avicola?`

### Paso 4. Respuesta conversacional

Laura confirma de forma humana y breve que ya organizo la informacion.

Ejemplo:

`Perfecto. Te organicé esto para guardarlo. Revísalo y ajusta lo que quieras.`

### Paso 5. Confirmacion editable

Se muestra una unica confirmacion con bloques internos editables.

### Paso 6. Guardado parcial

El comercial puede aprobar, editar o descartar cada bloque y luego guardar solo lo aprobado.

## Estructura de confirmacion editable

La confirmacion debe aparecer como una sola experiencia, dividida en bloques compactos:

### Bloque de cliente

- cliente detectado
- contacto detectado
- oportunidad relacionada o sugerida

### Bloque de interaccion

- tipo de interaccion
- resumen estructurado de lo ocurrido

### Bloque de accion

- siguiente paso sugerido
- fecha sugerida de seguimiento
- prioridad si aplica

### Bloque de tarea

- tarea a crear
- fecha objetivo

### Bloque de senales

- objeciones detectadas
- riesgo percibido
- intencion de compra si es inferible

## Persistencia permitida en V1

Desde un solo mensaje, Laura puede proponer varios resultados al mismo tiempo:

- crear un registro base de interaccion o reporte
- crear seguimiento
- crear tarea
- actualizar oportunidad
- actualizar etapa de oportunidad
- registrar objecion o senal comercial

El comercial no esta obligado a aceptar todos esos efectos.

## Reglas de negocio V1

### Resolucion de contexto

- no exigir seleccion previa de cliente
- tolerar nombres incompletos o aproximados
- preferir preguntar antes de guardar si hay multiples coincidencias razonables
- usar contexto de pantalla como pista, no como verdad absoluta

### Ambiguedad

Preguntar antes de guardar cuando no haya suficiente certeza sobre:

- cliente
- oportunidad
- fecha clave
- accion principal

### Priorizacion de agenda

Laura puede:

- listar pendientes del dia
- listar vencidos
- sugerir orden de atencion

Laura no debe:

- inventar pendientes por su cuenta
- crear tareas automaticas sin confirmacion del comercial
- sobreexplicar por que priorizo cada cosa en V1

## Tono y personalidad

Laura debe sentirse:

- calida
- cercana
- acompanante
- breve
- profesional

Debe evitar:

- tono corporativo frio
- explicaciones tecnicas
- insistir en que es una IA
- respuestas tipo bot de menu

Ejemplos deseados:

- `Te organicé esto para guardarlo.`
- `No estoy segura del cliente. Ayúdame a confirmarlo.`
- `Tienes varios pendientes hoy. Te dejo lo principal primero.`

## Alcance V1

Incluido:

- entrada libre por texto
- memoria conversacional dentro de la sesion
- aclaraciones por ambiguedad
- confirmacion editable por bloques
- guardado parcial
- pantalla principal de reporte
- acceso desde cliente y oportunidad
- consultas de pendientes y agenda del dia
- priorizacion simple de pendientes existentes

Excluido:

- notas de voz
- operacion desde WhatsApp
- automatizacion totalmente autonoma
- explicaciones detalladas del ranking de prioridad
- aprendizaje persistente basado en correcciones del usuario
- creacion de pendientes no confirmados por el comercial

## Nice To Have Futuros

### Aprendizaje desde correcciones

Cuando el comercial descarte o corrija bloques sugeridos, el sistema podria usar esa senal para mejorar sugerencias futuras.

Esto queda explicitamente fuera de V1, pero debe documentarse para no perder la oportunidad de evolucion.

Posibles usos futuros:

- aprender alias frecuentes de clientes
- mejorar relacion entre contactos y cuentas
- detectar estilos individuales de redaccion comercial
- ajustar sugerencias de siguiente paso

## Arquitectura funcional sugerida

La solucion deberia separarse en capas claras:

### Capa conversacional

Gestiona:

- mensajes del usuario
- contexto de sesion
- respuestas de Laura
- preguntas de aclaracion

### Capa de interpretacion

Extrae y estructura:

- entidades comerciales
- intenciones
- fechas
- acciones
- senales de riesgo u objecion

### Capa de resolucion

Cruza lo interpretado con datos reales del CRM para:

- resolver cliente
- resolver oportunidad
- encontrar coincidencias ambiguas
- decidir si hace falta preguntar

### Capa de propuesta de persistencia

Arma los bloques editables y define las operaciones candidatas.

### Capa de guardado

Persiste solo lo aprobado por el comercial.

## Riesgos principales

### 1. Resolucion incorrecta de cliente u oportunidad

Es el riesgo mas sensible para confianza.

Mitigacion:

- pregunta previa en casos ambiguos
- edicion antes de guardar
- guardado parcial

### 2. Chat demasiado abierto

Si Laura intenta soportar demasiadas intenciones desde el dia 1, la calidad cae.

Mitigacion:

- acotar V1 a reporte libre y agenda operativa
- limitar intenciones soportadas

### 3. Confirmacion demasiado pesada

Si la revision se parece a un formulario tradicional, se pierde el valor del chat.

Mitigacion:

- bloques compactos
- texto precargado
- interaccion rapida

## Recomendacion de lanzamiento

La primera version debe posicionarse como:

`Laura te ayuda a reportar visitas y organizar tu dia sin llenar el CRM a mano.`

No debe venderse primero como tecnologia ni como automatizacion avanzada.

El valor principal para adopcion es:

- hablar como ya trabajan hoy
- no duplicar reportes
- dejar memoria clara
- tener el siguiente paso mas ordenado

## Criterios de exito inicial

- el comercial puede reportar una visita en menos tiempo que llenando formulario manual
- la mayoria de mensajes se convierten en una propuesta util sin pedir muchas aclaraciones
- gerencia obtiene memoria comercial mas clara sin pedir reportes por fuera
- el comercial usa a Laura para revisar pendientes del dia de forma recurrente
