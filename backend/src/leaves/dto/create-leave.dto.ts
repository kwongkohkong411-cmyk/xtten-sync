import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateLeaveDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  status?: string;
}
