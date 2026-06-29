import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLeaveBalanceSettingDto {
  @IsOptional()
  @IsString()
  leaveTypeId?: string;

  @IsOptional()
  @IsEnum(['MONTHLY', 'YEARLY'])
  period?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  days?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
