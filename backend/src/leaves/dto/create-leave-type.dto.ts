import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(['PAID', 'UNPAID'])
  category!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
