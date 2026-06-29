import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateLeaveBalanceSettingDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  leaveTypeId!: string;

  @IsEnum(['MONTHLY', 'YEARLY'])
  period!: string;

  @IsNumber()
  @Min(0)
  days!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
