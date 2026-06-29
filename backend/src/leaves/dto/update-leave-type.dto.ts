import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['PAID', 'UNPAID'])
  category?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
