import { IsOptional, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  companyId!: string;

  @IsOptional()
  @IsString()
  status?: string;
}