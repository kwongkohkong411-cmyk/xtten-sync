import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateLeaveApproverDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
