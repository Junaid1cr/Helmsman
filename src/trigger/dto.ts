import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { EventType } from '../rules/types';

export class TriggerDto {
  @IsString()
  @IsNotEmpty()
  repo!: string; // git clone URL

  @IsString()
  @IsNotEmpty()
  branch!: string;

  @IsString()
  @IsNotEmpty()
  commit!: string; // full SHA preferred

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  changedFiles?: string[];

  @IsOptional()
  @IsIn(['push', 'pull_request'])
  eventType?: EventType;
}
