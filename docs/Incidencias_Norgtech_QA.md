# Incidencias encontradas — QA Norgtech CRM

> Reporte de QA transcrito y organizado a partir de `Incidencias encontradas.pdf` (28 páginas).
> Fecha de transcripción: 16/07/2026. Total de incidencias: **84**, agrupadas por módulo.

## Credenciales de usuarios para pruebas

| Rol | Correo | Contraseña |
|-----|--------|------------|
| Admin | admin@norgtech.com | AdminNorg2026! |
| Director comercial | dcomercial@correo.com | Nt-dRfZ1WJHPra1 |
| Comercial (Vendedor) | comercial@correo.com | Nt-0X2XiGEljC2r |
| Técnico | tecnico@correo.com | Nt-qbsgVVFrna-H |
| Facturación | facturacion@correo.com | Nt-L-UYYaMF0m00 |
| Logística | logistica@correo.com | Nt-UcUXdfwcpRiC |

## Convenciones

- **Tipo**: 🐞 Bug · 🔒 Seguridad/Permisos · 💰 Lógica de negocio · 🌐 i18n/Texto · ✨ Mejora/Feature · 🎨 UI/UX
- **ID**: identificador estable para referenciar la incidencia en el plan de correcciones.

---

## 1. Autenticación y sesión

| ID | Tipo | Incidencia |
|----|------|------------|
| AUTH-01 | 🔒🐞 | No redirige al login cuando vence el token (la petición responde `Invalid token` pero la app no reacciona). |
| AUTH-02 | 🐞 | No se está realizando el *refresh token* luego de que este vence. |
| AUTH-03 | 🌐 | Mostrar mensaje en español cuando el usuario está inactivo (hoy muestra `User is not an active eligible seller`). |

## 2. Permisos y control de acceso por rol (RBAC)

| ID | Tipo | Incidencia |
|----|------|------------|
| RBAC-01 | 🔒 | No permite crear empresa al rol Director comercial (revisar si debería permitirse). |
| RBAC-02 | 🔒 | No aparece el módulo Empresas a usuarios diferentes al Admin. |
| RBAC-03 | 🔒 | No aparecen los módulos **Zonas** y **Empresas** en el menú lateral a usuarios diferentes al Admin. |
| RBAC-04 | 🔒 | Permite navegar por URL al formulario de **nuevo cliente** a los roles: Técnico, Facturación, Logística. |
| RBAC-05 | 🔒 | Permite navegar por URL al formulario de **nueva oportunidad** a los roles: Técnico, Facturación, Logística. |
| RBAC-06 | 🔒 | Permite navegar por URL al formulario de **nueva cotización** a los roles: Técnico, Facturación, Logística. |
| RBAC-07 | 🔒 | Permite navegar por URL al formulario de **nuevo gasto** a los roles: Técnico, Facturación, Logística. |
| RBAC-08 | 🔒 | Permite navegar por URL al formulario de **nuevo pedido** a los roles: Técnico, Facturación. |
| RBAC-09 | 🔒 | Permite navegar por URL al formulario de **nueva tarea de seguimiento** a los roles: Facturación, Logística. |
| RBAC-10 | 🔒 | Permite navegar por URL al formulario de **nueva devolución** a los roles: Técnico, Logística. |
| RBAC-11 | 🔒 | Permite navegar por URL al formulario de **nueva factura** a los roles: Técnico, Comercial, Logística. |
| RBAC-12 | 🔒 | Permite navegar por URL al formulario de **nueva visita** al rol: Logística. |
| RBAC-13 | 🔒 | El usuario Comercial no debería ver la sección **Control comercial avanzado** del módulo Dashboard. |
| RBAC-14 | 🔒 | Se debe ocultar el botón **Ver facturación** del módulo Pedidos para los roles sin acceso al módulo de facturación. |

## 3. Dashboard y métricas

| ID | Tipo | Incidencia |
|----|------|------------|
| DASH-01 | 🌐 | En **Actividad reciente** no se ven nombres descriptivos, sino los nombres de variables a nivel código (`follow_up_task.created`, `visit.created`). |
| DASH-02 | 🌐 | Los nombres de las actividades recientes aparecen en inglés. |
| DASH-03 | 🐞 | No muestra información en la sección **"Mi cola de trabajo"**. |
| DASH-04 | 🐞💰 | En **Control comercial avanzado** no se muestran los datos cuando se ingresa con rol Comercial (con Admin sí funciona). |
| DASH-05 | 🐞 | La información del dashboard no se actualiza de acuerdo a la empresa seleccionada. |
| DASH-06 | 💰🐞 | No contabiliza las **ventas cerradas** (contador "Ventas cerradas 30d" en 0 pese a haber oportunidades ganadas). |

## 4. Agenda

| ID | Tipo | Incidencia |
|----|------|------------|
| AGEN-01 | 🐞 | El contador de **"Hoy"** no concuerda con el número de tarjetas mostradas. |
| AGEN-02 | 🐞 | No se filtran las tareas cuando se selecciona el filtro **"Vencidos · urgente"**. |

## 5. Clientes

| ID | Tipo | Incidencia |
|----|------|------------|
| CLI-01 | ✨ | El campo **"Asignado a"** del formulario de nuevo cliente debe ser de tipo catálogo (selector de usuarios), no texto libre de ID. |
| CLI-02 | 🐞🌐 | Error 500 al crear un cliente con **NIT duplicado**; debe mostrar mensaje descriptivo en español. |
| CLI-03 | 🐞 | No aparece el catálogo de **categoría de cliente** en el formulario de nuevo cliente. |
| CLI-04 | ✨ | Agregar el campo de **selección de zonas** en el formulario del cliente. |
| CLI-05 | 🐞 | No aparece la sección **Zonas** en el detalle del cliente. |
| CLI-06 | 🌐 | En el detalle del cliente, sección **Historial 360**, mostrar el nombre de la etapa en lugar del nombre a nivel código (`cotizacion`, `venta_cerrada`, etc.). |

## 6. Oportunidades

| ID | Tipo | Incidencia |
|----|------|------------|
| OPP-01 | 🐞 | Error al crear un pedido cuando la etapa de la oportunidad es **"Contacto"**. |
| OPP-02 | ✨ | No permite colocar un **motivo de pérdida** en el formulario de oportunidades (cuando la etapa es "Perdida"). |
| OPP-03 | 🐞 | No se registra la oportunidad en el detalle de la visita (queda "Sin oportunidad"). |

## 7. Cotizaciones y descuentos por segmento

| ID | Tipo | Incidencia |
|----|------|------------|
| QUO-01 | 💰🐞 | No trae el descuento en el formulario de nueva cotización a los clientes que superaron las metas establecidas en segmentos. |
| QUO-02 | 💰🐞 | No muestra los descuentos por segmentos en el resumen de la cotización (aparece `Descuento: NaN%`). |
| QUO-03 | 💰🐞 | El subtotal y total en el detalle de la cotización **no se calculan con el descuento**. |
| QUO-04 | 🐞 | No aparece un campo/opción para **cambiar el estado de la cotización**, impidiendo generar facturas (no se puede dejar en estado "cerrado"). |

## 8. Pedidos

| ID | Tipo | Incidencia |
|----|------|------------|
| ORD-01 | 💰🔒 | Permite crear pedido **excediendo la cantidad de créditos** del cliente. |
| ORD-02 | 💰🐞 | No se descuenta el crédito al cliente luego de hacer un pedido (y además permite superar el crédito máximo). |
| ORD-03 | 🐞 | La **empresa facturadora** en el detalle del pedido no es correcta: muestra el cliente en lugar de la empresa facturadora. |
| ORD-04 | 🐞💰 | Las cantidades de **subtotal, IVA y total** del pedido en el formulario de creación no coinciden con las del detalle del pedido. |
| ORD-05 | 🐞💰 | No aparece el **prefijo de la empresa** en el nombre del pedido en el módulo de pedidos. |
| ORD-06 | ✨ | No aparece el campo para **escoger la zona** en el formulario del pedido. |
| ORD-07 | 🐞💰 | Permite cambiar el estado del pedido hasta **"En tránsito" sin pedir el número de guía**. |
| ORD-08 | 🐞🌐 | Error al crear un pedido seleccionando cotización y cliente: `Opportunity does not belong to customer` / `Quote does not belong to customer` (status 400). Mostrar mensaje descriptivo. |
| ORD-09 | 🐞 | Los campos numéricos (cantidad) no bajan en unidades sino en **decimales** (ej. 0.9999). |

## 9. Facturación y solicitudes de facturación

| ID | Tipo | Incidencia |
|----|------|------------|
| BILL-01 | 🐞🌐 | Error al crear una solicitud de facturación: `companyId should not be empty` / `companyId must be a string` (status 400). |
| BILL-02 | 🐞🌐 | No aparece mensaje descriptivo en la creación de la factura (mismo error `companyId should not be empty`). |
| BILL-03 | 🐞💰 | No aparece el prefijo de la empresa en el nombre de la solicitud de facturación en el módulo de facturación. |
| BILL-04 | 💰 | La acción de **generar solicitud de facturación** debería realizarse en el estado "Orden de facturación", no antes; procesar una facturación es lo que debería detonar el estado "Facturado". |

## 10. Devoluciones

| ID | Tipo | Incidencia |
|----|------|------------|
| RET-01 | 🐞🔒 | No se guardan o no se muestran las devoluciones con usuario de rol Comercial. |
| RET-02 | 🐞💰 | El monto del dinero devuelto en el módulo de Devoluciones no coincide con el monto mostrado en el Dashboard. |

## 11. Visitas

| ID | Tipo | Incidencia |
|----|------|------------|
| VIS-01 | 🐞 | El estatus de las visitas no cambia de "Programada" a "No realizada" cuando se pasa el tiempo. |
| VIS-02 | 🐞 | Las visitas programadas con fecha pasada no se muestran como **vencidas**. |
| VIS-03 | 🐞 | La **hora de creación** de la visita no es correcta (se crea con una hora totalmente diferente a la actual). |

## 12. Seguimientos

| ID | Tipo | Incidencia |
|----|------|------------|
| FUP-01 | 🐞 | El contador **"Vencen hoy"** no muestra la cantidad correcta. |
| FUP-02 | 🐞 | El contador de **tareas vencidas** no muestra la cantidad correcta (hay tareas vencidas que no contabiliza). |
| FUP-03 | 🐞 | El estatus de los seguimientos no cambia a "Vencida" cuando pasa el tiempo límite. |
| FUP-04 | 🐞 | Los seguimientos programados con fechas pasadas no se muestran como vencidos. |
| FUP-05 | 🐞 | Seguimiento pendiente no cambia a "Vencido" cuando pasa el tiempo establecido. |

## 13. Gastos

| ID | Tipo | Incidencia |
|----|------|------------|
| EXP-01 | 🐞 | No realiza la petición cuando se manda a revisión el gasto. |
| EXP-02 | 🌐 | En los archivos exportados del módulo de Gastos, los nombres de las columnas deben estar normalizados, no mostrarse como nombre a nivel código. |
| EXP-03 | 🐞 | Los formatos de fecha en los archivos exportados deben ser `dd/mm/aaaa` (más la hora), **no** el formato `2026-06-26T22:00:01.937Z`. |

## 14. Productos

| ID | Tipo | Incidencia |
|----|------|------------|
| PRD-01 | 🐞🌐 | Error 500 al crear un producto con **SKU duplicado**; debe mostrar mensaje descriptivo. |

## 15. Zonas

| ID | Tipo | Incidencia |
|----|------|------------|
| ZON-01 | 🐞 | Se desaparece la zona cuando se desactiva (debería seguir listándose como inactiva). |

## 16. Empresas

| ID | Tipo | Incidencia |
|----|------|------------|
| COM-01 | 🐞 | Desaparecen las empresas cuando se desactivan (debería seguir listándose como inactiva). |
| COM-02 | 🌐 | Mostrar texto descriptivo en español cuando hay error en algún campo (hoy: `prefix must be uppercase letters only`). |

## 17. Metas comerciales / metas de vendedor

| ID | Tipo | Incidencia |
|----|------|------------|
| GOAL-01 | 🐞 | Al agregar una meta comercial no aparece en la sección de arriba, solo en la de abajo. |
| GOAL-02 | 🐞💰 | No se están contabilizando los **pedidos** en las metas del vendedor (los pedidos aparecen como "Sin vendedor"). |

## 18. Internacionalización y presentación de textos (transversal)

| ID | Tipo | Incidencia |
|----|------|------------|
| I18N-01 | 🌐 | Mostrar los nombres de los **roles** en lugar del nombre a nivel código, con inicial en mayúscula y orden ortográfico correcto. |
| I18N-02 | 🌐 | Los porcentajes no se deben redondear: mostrarse con al menos **2 decimales**. |

## 19. Reportes

| ID | Tipo | Incidencia |
|----|------|------------|
| REP-01 | 🐞 | Error al descargar el PDF desde el detalle del reporte. |

## 20. IA Nora / WhatsApp

| ID | Tipo | Incidencia |
|----|------|------------|
| AI-01 | 🐞 | El pedido generado por la IA no pasa a estado "Rechazado" luego de la revisión. |
| AI-02 | 🐞 | No se realiza la transición de estados del ticket cuando se interactúa con la IA por WhatsApp. |
| AI-03 | 🐞 | No edita el NIT del cliente desde la IA de WhatsApp. |
| AI-04 | 🐞 | La IA no pide ni edita el número de teléfono del cliente. |
| AI-05 | 🐞 | La IA no pide los campos: Segmento, Correo, Dirección, Departamento y Notas del formulario de Cliente. |
| AI-06 | ✨ | No permite registrar gastos por medio de la IA en el módulo de WhatsApp. |
| AI-07 | 🐞 | No toma la fecha y hora de la visita desde WhatsApp, ni la descripción (ya sea en el mismo mensaje o en uno aparte). |
| AI-08 | 🐞 | No toma el dato de la descripción de la visita cuando se le pide **editar** una. |
| AI-09 | 🐞 | Confunde los flujos: al pedir editar una visita y no poder proveer la descripción, se solicitó eliminar; tomó el mensaje anterior de descripción y lo detectó como las visitas a eliminar. |
| AI-10 | 🐞 | Se rompe el flujo de **eliminación** de visitas (arrastra el problema de AI-09). |
| AI-11 | 🐞 | La opción **"Resumen del cliente"** de Nora no da respuesta. |

---

### Resumen por prioridad de negocio (ver plan de correcciones)

- **Críticas (dinero / seguridad):** ORD-01, ORD-02, ORD-03, ORD-04, QUO-01, QUO-02, QUO-03, RBAC-04→RBAC-12, AUTH-01, AUTH-02, DASH-06, GOAL-02, RET-02.
- **Funcionales altas:** BILL-01→BILL-04, ORD-07, ORD-08, OPP-01, QUO-04, todos los VIS/FUP de vencimientos, EXP-01, DASH-03/04/05.
- **UX / i18n / cosméticas:** I18N-01/02, DASH-01/02, CLI-06, COM-02, CLI-02, PRD-01, EXP-02/03, ZON-01, COM-01, GOAL-01.
- **IA / WhatsApp (Nora):** AI-01→AI-11.
