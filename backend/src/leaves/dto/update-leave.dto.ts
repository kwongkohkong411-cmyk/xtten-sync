import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateLeaveDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['ANNUAL', 'SICK', 'PERSONAL', 'OVERTIME', 'OTHER'])
  type?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  status?: string;
}
