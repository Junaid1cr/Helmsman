import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeployDto {
  @IsString()
  @IsNotEmpty()
  commit!: string; // full SHA preferred

  @IsOptional()
  @IsString()
  repo?: string; // git clone URL; defaults to the configured app repo

  @IsOptional()
  @IsString()
  branch?: string; // defaults to "main"

  @IsOptional()
  @IsString()
  message?: string;
}
