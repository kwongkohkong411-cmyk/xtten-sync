import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertTenantConfigDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  isolationLevel?: string;

  @IsOptional()
  @IsBoolean()
  allowCrossTenantReporting?: boolean;

  @IsOptional()
  @IsBoolean()
  enforceSso?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultUserLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultStorageGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;
}
