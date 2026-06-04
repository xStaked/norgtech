import { PrismaClient, UserRole, OpportunityStage, QuoteStatus, OrderStatus, BillingRequestStatus, VisitStatus, FollowUpTaskStatus, FollowUpTaskType, CommercialExpenseCategory, CommercialExpenseStatus } from "@prisma/client";

type BcryptModule = {
  hash(value: string, rounds: number): Promise<string>;
};

const bcrypt = require("bcryptjs") as BcryptModule;

const prisma = new PrismaClient();

// ── UUIDs ──────────────────────────────────────────────
const user_admin = "3498fb49-bf72-41e9-aa6f-5bf0d0997f71";
const user_director = "be3365aa-0b10-4983-8f5e-ec1257d878c4";
const user_comercial = "904198ef-ab19-40d0-92f0-8622b06569b8";
const user_tecnico = "760c715a-d52c-4450-a068-ca84decc58ec";
const user_facturacion = "a5ee2979-5a55-45a5-be7b-10deefefcb6a";
const user_logistica = "e405b989-5227-4da7-9bba-639225125d0d";

const segment_oro = "754a9936-081f-42a6-9ebb-7a5e7a1a8ea4";
const segment_plata = "f6c48d99-916a-4c25-aaea-b7c0d55afd03";
const segment_bronce = "f003a568-d395-434d-9e74-6de3f2f0e618";
const segment_platino = "c9e1a2b3-4d5e-6f7a-8b9c-0d1e2f3a4b5c";
const segment_retail = "ed8440f7-2768-4ac3-8986-b362917f194e";
const segment_industria = "26c81d48-808d-4793-9d34-6df05e57bb4f";

const cust_1 = "cfba5b04-6e92-4b95-bece-f35cf5ec03f1";
const cust_2 = "ecc72705-68e3-4254-bcdf-5666128a9531";
const cust_3 = "0e6a5de9-dda1-4066-8bf2-b65fe2ae03ab";
const cust_4 = "32897929-df2c-4cb3-b5cd-f9d8b2db5804";
const cust_5 = "c40f8c08-b78d-429e-86bc-650dbc90d9ae";
const cust_6 = "a34d0316-e9ef-4375-bd9a-a364c6558170";
const cust_7 = "d141353c-fc8d-4c44-bdb2-cbb2576b7481";
const cust_8 = "96410592-e218-4625-81eb-08d609ca02bf";

const prod_1 = "bd14b899-1b0d-4645-ade3-4921ed5f8643";
const prod_2 = "f0fbf1c7-6362-4bcc-8487-92d89243243f";
const prod_3 = "e8b69857-4b4a-4cbc-b300-8cde82b1141c";
const prod_4 = "18de0f12-5124-4e07-9fb1-5481e8fde5ad";
const prod_5 = "3b1c22ef-7ffc-4ab5-863d-31e619981122";
const prod_6 = "50e8d94d-728b-41ce-80bf-bde9e83fe2f5";
const prod_7 = "de101fcf-e875-4351-8178-1d0fe6e5cc94";
const prod_8 = "29117b08-57d5-4319-8db7-aaf561a76471";

const opp_1 = "090ca9b4-2f1f-456d-b521-3ba03a85c72f";
const opp_2 = "2fb5b151-259a-49cd-9334-cf94548a266b";
const opp_3 = "a95295e5-4526-4216-bef4-406f8eb9d594";
const opp_4 = "f00ee12e-0e0f-4c42-97a2-e0b345327b5d";
const opp_5 = "674eb052-ada1-46f9-a613-15863c071723";
const opp_6 = "47cecf44-cebb-4e4c-8d13-e6ef1b06e6a0";
const opp_7 = "c1068e07-8fdf-466e-bb38-b40ac1070d33";
const opp_8 = "35120b9f-1fdd-45d5-b8f1-fab521aae395";

const quote_1 = "cf84ba41-46d2-4f91-a624-c4726ada65e9";
const quote_2 = "c262c1e8-4fed-4699-86d7-60b313d6c2d7";
const quote_3 = "2ef0ff32-6a65-44c9-ab36-d46211fd40a2";

const order_1 = "78b04411-335c-4290-9fca-38bebf7232c2";
const order_2 = "1300fc35-22d4-482a-ac3c-779f6e033511";

const visit_1 = "8ab2e1ab-8513-40b6-ba5e-954e65406b59";
const visit_2 = "04072126-5193-4d3a-8a4f-8b91fb53e038";
const visit_3 = "59e3eff7-d8fe-419a-aa02-3315b8f25a27";
const visit_4 = "f3284035-b6e2-40f8-9419-d50d75162147";

const task_1 = "761c16eb-9559-4ce0-aa7e-c9fccac7df04";
const task_2 = "01d84f0d-3a93-4ca7-b6e7-f6537d39f173";
const task_3 = "42d5e5a0-25f4-43dd-818d-5da4481d246a";
const task_4 = "f689c94c-85ca-46d2-bee3-7809fad4cb87";
const task_5 = "f627299a-87ad-43c6-9a3b-40ac6f7ac07a";

const bill_1 = "508480f4-f129-4013-87a3-4eebdef6bee2";
const bill_2 = "46c253c2-b3f1-481c-987f-66a561d67971";

const expense_1 = "0b96a4f3-f1a9-4e1e-9f75-dc6587f7072e";
const expense_2 = "cf1e1345-822f-42d7-bf72-6108c4927d7d";

async function main() {
  // ── Users ────────────────────────────────────────────
  const users = [
    { id: user_admin, name: "Administrador", email: "admin@norgtech.com", password: "Admin123!", role: UserRole.administrador },
    { id: user_director, name: "Carlos Mendoza", email: "director@norgtech.com", password: "Director123!", role: UserRole.director_comercial },
    { id: user_comercial, name: "Laura Torres", email: "comercial@norgtech.com", password: "Comercial123!", role: UserRole.comercial },
    { id: user_tecnico, name: "Andres Rojas", email: "tecnico@norgtech.com", password: "Tecnico123!", role: UserRole.tecnico },
    { id: user_facturacion, name: "Diana Vargas", email: "facturacion@norgtech.com", password: "Facturacion123!", role: UserRole.facturacion },
    { id: user_logistica, name: "Pedro Gomez", email: "logistica@norgtech.com", password: "Logistica123!", role: UserRole.logistica },
  ];

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, passwordHash, role: user.role, active: true },
      create: { id: user.id, name: user.name, email: user.email, passwordHash, role: user.role, active: true },
    });
  }

  // ── Customer Segments ────────────────────────────────
  const segments = [
    { id: segment_bronce, name: "Bronce", description: "Clientes nuevos o de bajo volumen", discountPercent: 3, minGoalAmount: 0, maxGoalAmount: 50000000 },
    { id: segment_plata, name: "Plata", description: "Clientes con buen potencial de crecimiento", discountPercent: 5, minGoalAmount: 50000000, maxGoalAmount: 150000000 },
    { id: segment_oro, name: "Oro", description: "Clientes estrategicos con alto volumen de compra", discountPercent: 8, minGoalAmount: 150000000, maxGoalAmount: 300000000 },
    { id: segment_platino, name: "Platino", description: "Clientes VIP con volumen excepcional", discountPercent: 12, minGoalAmount: 300000000, maxGoalAmount: null },
    { id: segment_retail, name: "Retail", description: "Cadenas de tiendas y distribuidores", discountPercent: 4, minGoalAmount: 0, maxGoalAmount: 100000000 },
    { id: segment_industria, name: "Industria", description: "Manufactura y sector industrial", discountPercent: 6, minGoalAmount: 100000000, maxGoalAmount: null },
  ];

  for (const seg of segments) {
    await prisma.customerSegment.upsert({
      where: { name: seg.name },
      update: {
        description: seg.description,
        discountPercent: seg.discountPercent,
        minGoalAmount: seg.minGoalAmount,
        maxGoalAmount: seg.maxGoalAmount,
        active: true,
        updatedBy: user_director,
      },
      create: { id: seg.id, name: seg.name, description: seg.description, discountPercent: seg.discountPercent, minGoalAmount: seg.minGoalAmount, maxGoalAmount: seg.maxGoalAmount, active: true, createdBy: user_director, updatedBy: user_director },
    });
  }

  // ── Customers ────────────────────────────────────────
  const customers = [
    { id: cust_1, legalName: "Industrias del Norte S.A.S.", displayName: "Indunorte", taxId: "900123456-1", phone: "+57 601 2345678", email: "compras@indunorte.com", address: "Calle 100 # 15-30", city: "Bogota", department: "Cundinamarca", notes: "Cliente estrategico desde 2019. Principal comprador de equipos industriales.", segmentId: segment_oro, assignedToUserId: user_comercial },
    { id: cust_2, legalName: "Supermercados La Economia S.A.", displayName: "La Economia", taxId: "800234567-2", phone: "+57 604 3456789", email: "abastecimiento@laeconomia.com", address: "Carrera 43 # 1-50", city: "Medellin", department: "Antioquia", notes: "Cadena de 45 tiendas. Requiere entregas just-in-time.", segmentId: segment_retail, assignedToUserId: user_comercial },
    { id: cust_3, legalName: "Constructora El Progreso Ltda.", displayName: "El Progreso", taxId: "830345678-3", phone: "+57 601 4567890", email: "logistica@elprogreso.com.co", address: "Avenida El Dorado # 68-20", city: "Bogota", department: "Cundinamarca", notes: "Proyectos de infraestructura publica. Pagos a 60 dias.", segmentId: segment_plata, assignedToUserId: user_comercial },
    { id: cust_4, legalName: "Farmaceutica Andina S.A.", displayName: "FarAndina", taxId: "860456789-4", phone: "+57 602 5678901", email: "proveedores@farandina.com", address: "Calle 5 # 28-45", city: "Cali", department: "Valle del Cauca", notes: "Sector salud. Requiere certificaciones ISO y trazabilidad.", segmentId: segment_industria, assignedToUserId: user_director },
    { id: cust_5, legalName: "TecnoSoluciones Colombia S.A.S.", displayName: "TecnoSol", taxId: "900567890-5", phone: "+57 605 6789012", email: "gerencia@tecnosol.co", address: "Carrera 7 # 72-35", city: "Bogota", department: "Cundinamarca", notes: "Startup en crecimiento. Interesada en soluciones IoT.", segmentId: segment_bronce, assignedToUserId: user_comercial },
    { id: cust_6, legalName: "Alimentos del Valle S.A.", displayName: "Alivalle", taxId: "805678901-6", phone: "+57 602 7890123", email: "compras@alivalle.com", address: "Zona Industrial Mamonal", city: "Cartagena", department: "Bolivar", notes: "Procesadora de alimentos. Requiere equipos de refrigeracion industrial.", segmentId: segment_plata, assignedToUserId: user_comercial },
    { id: cust_7, legalName: "Minerales Andinos S.A.", displayName: "MinAndes", taxId: "860789012-7", phone: "+57 607 8901234", email: "abastecimiento@minandes.com", address: "Carrera 15 # 88-10", city: "Bucaramanga", department: "Santander", notes: "Sector minero. Equipos de alta resistencia.", segmentId: segment_oro, assignedToUserId: user_director },
    { id: cust_8, legalName: "Textiles del Caribe Ltda.", displayName: "TexCaribe", taxId: "830890123-8", phone: "+57 605 9012345", email: "compras@texcaribe.com", address: "Via 40 # 72-150", city: "Barranquilla", department: "Atlantico", notes: "Maquila textil. Renovacion de maquinaria planificada para Q4.", segmentId: segment_bronce, assignedToUserId: user_comercial },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, active: true, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Contacts ─────────────────────────────────────────
  const contacts = [
    { customerId: cust_1, fullName: "Roberto Sanchez", roleTitle: "Gerente de Compras", phone: "+57 310 1234567", email: "rsanchez@indunorte.com", isPrimary: true },
    { customerId: cust_1, fullName: "Mariana Lopez", roleTitle: "Directora de Operaciones", phone: "+57 311 2345678", email: "mlopez@indunorte.com", isPrimary: false },
    { customerId: cust_2, fullName: "Carlos Herrera", roleTitle: "Jefe de Abastecimiento", phone: "+57 312 3456789", email: "cherrera@laeconomia.com", isPrimary: true },
    { customerId: cust_3, fullName: "Diana Castro", roleTitle: "Directora de Proyectos", phone: "+57 313 4567890", email: "dcastro@elprogreso.com.co", isPrimary: true },
    { customerId: cust_4, fullName: "Luisa Fernandez", roleTitle: "Jefa de Calidad", phone: "+57 314 5678901", email: "lfernandez@farandina.com", isPrimary: true },
    { customerId: cust_5, fullName: "Andres Martinez", roleTitle: "CEO", phone: "+57 315 6789012", email: "amartinez@tecnosol.co", isPrimary: true },
    { customerId: cust_6, fullName: "Sofia Ramirez", roleTitle: "Gerente de Planta", phone: "+57 316 7890123", email: "sramirez@alivalle.com", isPrimary: true },
    { customerId: cust_7, fullName: "Fernando Diaz", roleTitle: "Superintendente de Mina", phone: "+57 317 8901234", email: "fdiaz@minandes.com", isPrimary: true },
    { customerId: cust_8, fullName: "Juliana Torres", roleTitle: "Jefa de Produccion", phone: "+57 318 9012345", email: "jtorres@texcaribe.com", isPrimary: true },
  ];

  for (const ct of contacts) {
    await prisma.contact.create({
      data: { ...ct, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Products ─────────────────────────────────────────
  const products = [
    { id: prod_1, sku: "NT-INV-001", name: "Inversor Industrial 50kW", description: "Inversor trifasico para aplicaciones industriales con monitoreo remoto", unit: "unidad", presentation: "Caja con manual y cables", basePrice: 12500000 },
    { id: prod_2, sku: "NT-SEN-002", name: "Sensor IoT MultiPro", description: "Sensor multiparametrico con conectividad LoRaWAN y WiFi", unit: "unidad", presentation: "Kit completo con gateway", basePrice: 2800000 },
    { id: prod_3, sku: "NT-REF-003", name: "Compresor Industrial 100HP", description: "Compresor de tornillo con sistema de enfriamiento integrado", unit: "unidad", presentation: "Sobre pallet industrial", basePrice: 45000000 },
    { id: prod_4, sku: "NT-PLC-004", name: "Controlador PLC NT-X200", description: "PLC programable con 32 entradas/salidas y pantalla HMI integrada", unit: "unidad", presentation: "Caja con software incluido", basePrice: 5800000 },
    { id: prod_5, sku: "NT-CAM-005", name: "Sistema de Vision Artificial", description: "Camara industrial con IA para control de calidad automatico", unit: "unidad", presentation: "Kit con iluminacion LED", basePrice: 18900000 },
    { id: prod_6, sku: "NT-UPS-006", name: "UPS Industrial 20kVA", description: "Sistema de respaldo de energia con baterias de litio", unit: "unidad", presentation: "Gabinete con ruedas", basePrice: 15200000 },
    { id: prod_7, sku: "NT-ROB-007", name: "Brazo Robotico Colaborativo", description: "Robot colaborativo de 6 ejes con carga util de 10kg", unit: "unidad", presentation: "Sobre base fija con controlador", basePrice: 78000000 },
    { id: prod_8, sku: "NT-SOF-008", name: "Licencia Norgtech MES", description: "Sistema de ejecucion de manufactura en la nube, licencia anual", unit: "licencia", presentation: "Licencia digital con soporte", basePrice: 45000000 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: { ...p, active: true, createdBy: user_director, updatedBy: user_director },
    });
  }

  // ── Opportunities ────────────────────────────────────
  const now = new Date();
  const opportunities = [
    { id: opp_1, customerId: cust_1, title: "Renovacion completa linea de produccion", description: "El cliente quiere renovar toda su linea de produccion norte con equipos de ultima generacion.", stage: OpportunityStage.negociacion, estimatedValue: 145000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 1, 15), assignedToUserId: user_comercial },
    { id: opp_2, customerId: cust_2, title: "Implementacion IoT cadena de frio", description: "Monitoreo de temperatura en tiempo real para sus 45 tiendas.", stage: OpportunityStage.cotizacion, estimatedValue: 42000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 2, 1), assignedToUserId: user_comercial },
    { id: opp_3, customerId: cust_3, title: "Suministro equipos construccion via al Llano", description: "Proyecto de infraestructura vial. Requiere compresores y generadores.", stage: OpportunityStage.visita, estimatedValue: 89000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 3, 10), assignedToUserId: user_comercial },
    { id: opp_4, customerId: cust_4, title: "Sistema de trazabilidad farmaceutica", description: "Implementacion de vision artificial y codificacion para lotes.", stage: OpportunityStage.prospecto, estimatedValue: 65000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 2, 20), assignedToUserId: user_director },
    { id: opp_5, customerId: cust_5, title: "Plataforma IoT para agricultura inteligente", description: "Desarrollo de solucion custom de sensores para monitoreo de cultivos.", stage: OpportunityStage.contacto, estimatedValue: 18000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 1, 30), assignedToUserId: user_comercial },
    { id: opp_6, customerId: cust_6, title: "Renovacion sistema de refrigeracion", description: "Cambio de compresores y automatizacion de cuartos frios.", stage: OpportunityStage.cotizacion, estimatedValue: 72000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 2, 5), assignedToUserId: user_comercial },
    { id: opp_7, customerId: cust_7, title: "Automatizacion mina subterranea", description: "Robots colaborativos para muestreo y control de calidad en zona de extraccion.", stage: OpportunityStage.negociacion, estimatedValue: 210000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 4, 1), assignedToUserId: user_director },
    { id: opp_8, customerId: cust_8, title: "Modernizacion maquinaria textil", description: "Cambio de telares y automatizacion de corte.", stage: OpportunityStage.prospecto, estimatedValue: 55000000, expectedCloseDate: new Date(now.getFullYear(), now.getMonth() + 3, 15), assignedToUserId: user_comercial },
  ];

  for (const o of opportunities) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: { ...o, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Quotes ───────────────────────────────────────────
  const quotes = [
    { id: quote_1, customerId: cust_1, opportunityId: opp_1, status: QuoteStatus.en_negociacion, validUntil: new Date(now.getFullYear(), now.getMonth() + 1, 20), notes: "Incluye instalacion y capacitacion. Descuento por volumen aplicado.", subtotal: 135000000, total: 145000000 },
    { id: quote_2, customerId: cust_6, opportunityId: opp_6, status: QuoteStatus.abierta, validUntil: new Date(now.getFullYear(), now.getMonth() + 2, 10), notes: "Cotizacion preliminar sujeta a visita tecnica.", subtotal: 68000000, total: 72000000 },
    { id: quote_3, customerId: cust_7, opportunityId: opp_7, status: QuoteStatus.en_negociacion, validUntil: new Date(now.getFullYear(), now.getMonth() + 3, 1), notes: "Proyecto llave en mano. Incluye soporte 24/7 por 2 anos.", subtotal: 195000000, total: 210000000 },
  ];

  for (const q of quotes) {
    await prisma.quote.upsert({
      where: { id: q.id },
      update: {},
      create: { ...q, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Quote Items ──────────────────────────────────────
  const quoteItems = [
    { quoteId: quote_1, productId: prod_1, productSnapshotName: "Inversor Industrial 50kW", productSnapshotSku: "NT-INV-001", unit: "unidad", quantity: 4, unitPrice: 12500000, subtotal: 50000000 },
    { quoteId: quote_1, productId: prod_4, productSnapshotName: "Controlador PLC NT-X200", productSnapshotSku: "NT-PLC-004", unit: "unidad", quantity: 8, unitPrice: 5800000, subtotal: 46400000 },
    { quoteId: quote_1, productId: prod_6, productSnapshotName: "UPS Industrial 20kVA", productSnapshotSku: "NT-UPS-006", unit: "unidad", quantity: 3, unitPrice: 15200000, subtotal: 45600000 },
    { quoteId: quote_2, productId: prod_3, productSnapshotName: "Compresor Industrial 100HP", productSnapshotSku: "NT-REF-003", unit: "unidad", quantity: 1, unitPrice: 45000000, subtotal: 45000000 },
    { quoteId: quote_2, productId: prod_4, productSnapshotName: "Controlador PLC NT-X200", productSnapshotSku: "NT-PLC-004", unit: "unidad", quantity: 4, unitPrice: 5800000, subtotal: 23200000 },
    { quoteId: quote_3, productId: prod_7, productSnapshotName: "Brazo Robotico Colaborativo", productSnapshotSku: "NT-ROB-007", unit: "unidad", quantity: 2, unitPrice: 78000000, subtotal: 156000000 },
    { quoteId: quote_3, productId: prod_5, productSnapshotName: "Sistema de Vision Artificial", productSnapshotSku: "NT-CAM-005", unit: "unidad", quantity: 2, unitPrice: 18900000, subtotal: 37800000 },
  ];

  for (const qi of quoteItems) {
    await prisma.quoteItem.create({ data: qi });
  }

  // ── Orders ───────────────────────────────────────────
  const orders = [
    { id: order_1, customerId: cust_1, opportunityId: opp_1, sourceQuoteId: quote_1, status: OrderStatus.orden_facturacion, requestedDeliveryDate: new Date(now.getFullYear(), now.getMonth() + 1, 30), committedDeliveryDate: new Date(now.getFullYear(), now.getMonth() + 1, 25), notes: "Prioridad alta. Coordinar entrega fin de semana.", subtotal: 135000000, total: 145000000, assignedLogisticsUserId: user_logistica },
    { id: order_2, customerId: cust_6, opportunityId: opp_6, sourceQuoteId: quote_2, status: OrderStatus.recibido, requestedDeliveryDate: new Date(now.getFullYear(), now.getMonth() + 2, 15), notes: "Pendiente confirmacion de pago anticipado del 30%.", subtotal: 68000000, total: 72000000 },
  ];

  for (const o of orders) {
    await prisma.order.upsert({
      where: { id: o.id },
      update: {},
      create: { ...o, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Order Items ──────────────────────────────────────
  const orderItems = [
    { orderId: order_1, productId: prod_1, productSnapshotName: "Inversor Industrial 50kW", productSnapshotSku: "NT-INV-001", unit: "unidad", quantity: 4, unitPrice: 12500000, subtotal: 50000000 },
    { orderId: order_1, productId: prod_4, productSnapshotName: "Controlador PLC NT-X200", productSnapshotSku: "NT-PLC-004", unit: "unidad", quantity: 8, unitPrice: 5800000, subtotal: 46400000 },
    { orderId: order_1, productId: prod_6, productSnapshotName: "UPS Industrial 20kVA", productSnapshotSku: "NT-UPS-006", unit: "unidad", quantity: 3, unitPrice: 15200000, subtotal: 45600000 },
    { orderId: order_2, productId: prod_3, productSnapshotName: "Compresor Industrial 100HP", productSnapshotSku: "NT-REF-003", unit: "unidad", quantity: 1, unitPrice: 45000000, subtotal: 45000000 },
    { orderId: order_2, productId: prod_4, productSnapshotName: "Controlador PLC NT-X200", productSnapshotSku: "NT-PLC-004", unit: "unidad", quantity: 4, unitPrice: 5800000, subtotal: 23200000 },
  ];

  for (const oi of orderItems) {
    await prisma.orderItem.create({ data: oi });
  }

  // ── Visits ───────────────────────────────────────────
  const visits = [
    { id: visit_1, customerId: cust_1, opportunityId: opp_1, scheduledAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 9, 0), status: VisitStatus.programada, summary: "Presentacion de propuesta tecnica al comite de compras.", assignedToUserId: user_tecnico },
    { id: visit_2, customerId: cust_3, opportunityId: opp_3, scheduledAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 14, 0), status: VisitStatus.programada, assignedToUserId: user_tecnico },
    { id: visit_3, customerId: cust_6, opportunityId: opp_6, scheduledAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 10, 0), status: VisitStatus.completada, summary: "Inspeccion de cuartos frios existentes. Se identificaron 3 compresores para reemplazo.", diagnosis: "Compresores con mas de 15 anos de operacion. Baja eficiencia energetica.", problems: "Fugas de refrigerante en 2 unidades. Vibracion anormal en la tercera.", proposedSolution: "Reemplazo por modelos NT-REF-003 con controlador PLC para optimizacion.", nextStep: "Enviar cotizacion formal con plan de financiamiento.", assignedToUserId: user_tecnico },
    { id: visit_4, customerId: cust_7, opportunityId: opp_7, scheduledAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 8, 0), status: VisitStatus.programada, assignedToUserId: user_tecnico },
  ];

  for (const v of visits) {
    await prisma.visit.upsert({
      where: { id: v.id },
      update: {},
      create: { ...v, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Follow Up Tasks ──────────────────────────────────
  const tasks = [
    { id: task_1, customerId: cust_1, opportunityId: opp_1, type: FollowUpTaskType.llamada, title: "Seguimiento propuesta Indunorte", dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0), notes: "Confirmar recepcion de cotizacion y agendar reunion con comite.", assignedToUserId: user_comercial },
    { id: task_2, customerId: cust_2, opportunityId: opp_2, type: FollowUpTaskType.email, title: "Enviar brochure IoT cadena de frio", dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 14, 0), notes: "Incluir casos de exito de clientes similares.", assignedToUserId: user_comercial },
    { id: task_3, customerId: cust_6, opportunityId: opp_6, type: FollowUpTaskType.reunion, title: "Presentar cotizacion formal Alivalle", dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 11, 0), notes: "Preparar demo de PLC en sala de juntas.", assignedToUserId: user_comercial },
    { id: task_4, customerId: cust_7, opportunityId: opp_7, type: FollowUpTaskType.llamada, title: "Coordinar visita tecnica MinAndes", dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 16, 0), notes: "Solicitar permisos de seguridad para mina subterranea.", assignedToUserId: user_director },
    { id: task_5, customerId: cust_4, opportunityId: opp_4, type: FollowUpTaskType.whatsapp, title: "Contactar referido FarAndina", dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 9, 0), notes: "El contacto principal recomendo hablar con el jefe de mantenimiento.", assignedToUserId: user_comercial },
  ];

  for (const t of tasks) {
    await prisma.followUpTask.upsert({
      where: { id: t.id },
      update: {},
      create: { ...t, createdBy: user_comercial, updatedBy: user_comercial },
    });
  }

  // ── Billing Requests ─────────────────────────────────
  const billingRequests = [
    { id: bill_1, customerId: cust_1, opportunityId: opp_1, sourceType: "quote", sourceQuoteId: quote_1, status: BillingRequestStatus.procesada, notes: "Facturacion 50% anticipo. Resto contra entrega.", requestedByUserId: user_facturacion },
    { id: bill_2, customerId: cust_6, opportunityId: opp_6, sourceType: "quote", sourceQuoteId: quote_2, status: BillingRequestStatus.pendiente, notes: "Pendiente confirmacion de pago anticipado del 30%.", requestedByUserId: user_facturacion },
  ];

  for (const b of billingRequests) {
    await prisma.billingRequest.upsert({
      where: { id: b.id },
      update: {},
      create: { ...b, createdBy: user_facturacion, updatedBy: user_facturacion },
    });
  }

  // ── Commercial Expenses ─────────────────────────────
  const commercialExpenses = [
    {
      id: expense_1,
      expenseDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
      category: CommercialExpenseCategory.alimentacion,
      amount: 38000,
      description: "Almuerzo con cliente en visita comercial",
      status: CommercialExpenseStatus.pendiente,
      submittedByUserId: user_comercial,
      customerId: cust_1,
      visitId: visit_1,
      support: {
        bucket: "seed-r2-bucket",
        objectKey: "seed/commercial-expenses/factura-alimentacion.png",
        fileName: "factura-alimentacion.png",
        contentType: "image/png",
        sizeBytes: 120000,
      },
    },
    {
      id: expense_2,
      expenseDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3),
      category: CommercialExpenseCategory.peajes,
      amount: 18000,
      description: "Peaje durante visita tecnica a cliente",
      status: CommercialExpenseStatus.aprobado,
      submittedByUserId: user_comercial,
      customerId: cust_6,
      visitId: visit_3,
      reviewedByUserId: user_facturacion,
      reviewedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
      support: {
        bucket: "seed-r2-bucket",
        objectKey: "seed/commercial-expenses/recibo-peaje.pdf",
        fileName: "recibo-peaje.pdf",
        contentType: "application/pdf",
        sizeBytes: 84000,
      },
    },
  ];

  for (const expense of commercialExpenses) {
    await prisma.commercialExpense.upsert({
      where: { id: expense.id },
      update: {},
      create: {
        id: expense.id,
        expenseDate: expense.expenseDate,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        status: expense.status,
        submittedByUserId: expense.submittedByUserId,
        customerId: expense.customerId,
        visitId: expense.visitId,
        reviewedByUserId: expense.reviewedByUserId,
        reviewedAt: expense.reviewedAt,
        createdBy: expense.submittedByUserId,
        updatedBy: expense.reviewedByUserId ?? expense.submittedByUserId,
        supports: {
          create: {
            bucket: expense.support.bucket,
            objectKey: expense.support.objectKey,
            fileName: expense.support.fileName,
            contentType: expense.support.contentType,
            sizeBytes: expense.support.sizeBytes,
            uploadedByUserId: expense.submittedByUserId,
          },
        },
      },
    });
  }

  console.log("✅ Seed completado con exito.");
  console.log("   - 6 usuarios");
  console.log("   - 6 segmentos");
  console.log("   - 8 clientes");
  console.log("   - 9 contactos");
  console.log("   - 8 productos");
  console.log("   - 8 oportunidades");
  console.log("   - 3 cotizaciones con items");
  console.log("   - 2 ordenes con items");
  console.log("   - 4 visitas");
  console.log("   - 5 tareas de seguimiento");
  console.log("   - 2 solicitudes de facturacion");
  console.log("   - 2 gastos comerciales");
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
