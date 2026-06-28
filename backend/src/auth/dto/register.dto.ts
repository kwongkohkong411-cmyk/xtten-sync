import { IsEmail, IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}
