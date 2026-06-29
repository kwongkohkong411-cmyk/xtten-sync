import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLeaveApproverDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
