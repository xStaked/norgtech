import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommissionsController } from "./commissions.controller";
import { CommissionsLedgerController } from "./commissions-ledger.controller";
import { CommissionsService } from "./commissions.service";

@Module({
  imports: [AuthModule],
  controllers: [CommissionsController, CommissionsLedgerController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
