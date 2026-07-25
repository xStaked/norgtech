import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CalculatorsModule } from "./modules/calculators/calculators.module";
import { CommercialExpensesModule } from "./modules/commercial-expenses/commercial-expenses.module";
import { CreditModule } from "./modules/credit/credit.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { CustomerSegmentsModule } from "./modules/customer-segments/customer-segments.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { OpportunitiesModule } from "./modules/opportunities/opportunities.module";
import { PriceListsModule } from "./modules/price-lists/price-lists.module";
import { ProductsModule } from "./modules/products/products.module";
import { FollowUpTasksModule } from "./modules/follow-up-tasks/follow-up-tasks.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { VisitsModule } from "./modules/visits/visits.module";
import { BillingRequestsModule } from "./modules/billing-requests/billing-requests.module";
import { CustomerGoalsModule } from "./modules/customer-goals/customer-goals.module";
import { SellerGoalsModule } from "./modules/seller-goals/seller-goals.module";
import { WhatsAppModule } from "./modules/whatsapp/whatsapp.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReturnsModule } from "./modules/returns/returns.module";
import { UsersModule } from "./modules/users/users.module";
import { ZonesModule } from "./modules/zones/zones.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomerSegmentsModule,
    CompaniesModule,
    ContactsModule,
    DashboardModule,
    AnalyticsModule,
    AuditModule,
    NotificationsModule,
    CustomersModule,
    OpportunitiesModule,
    PriceListsModule,
    ProductsModule,
    PricingModule,
    QuotesModule,
    OrdersModule,
    VisitsModule,
    BillingRequestsModule,
    FollowUpTasksModule,
    ReportsModule,
    CalculatorsModule,
    CommercialExpensesModule,
    CreditModule,
    CustomerGoalsModule,
    SellerGoalsModule,
    WhatsAppModule,
    InvoicesModule,
    ReturnsModule,
    ZonesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
