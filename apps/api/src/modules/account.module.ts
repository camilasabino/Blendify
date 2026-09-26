import { Module } from '@nestjs/common';
import { DeleteAccountUseCase } from '../application/use-cases/delete-account.use-case';
import { AccountController } from '../presentation/controllers/account.controller';

@Module({
  controllers: [AccountController],
  providers: [DeleteAccountUseCase],
})
export class AccountModule {}
