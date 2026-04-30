import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { CustomerSegmentsModule } from "./modules/customer-segments/customer-segments.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { OpportunitiesModule } from "./modules/opportunities/opportunities.module";
import { ProductsModule } from "./modules/products/products.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CustomerSegmentsModule,
    ContactsModule,
    AuditModule,
    CustomersModule,
    OpportunitiesModule,
    ProductsModule,
    QuotesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
