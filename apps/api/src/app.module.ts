import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CalculatorsModule } from "./modules/calculators/calculators.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { CustomerSegmentsModule } from "./modules/customer-segments/customer-segments.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { OpportunitiesModule } from "./modules/opportunities/opportunities.module";
import { ProductsModule } from "./modules/products/products.module";
import { FollowUpTasksModule } from "./modules/follow-up-tasks/follow-up-tasks.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { VisitsModule } from "./modules/visits/visits.module";
import { BillingRequestsModule } from "./modules/billing-requests/billing-requests.module";
import { LauraModule } from "./modules/laura/laura.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CustomerSegmentsModule,
    ContactsModule,
    DashboardModule,
    AuditModule,
    CustomersModule,
    OpportunitiesModule,
    ProductsModule,
    QuotesModule,
    OrdersModule,
    VisitsModule,
    BillingRequestsModule,
    FollowUpTasksModule,
    ReportsModule,
    CalculatorsModule,
    LauraModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
