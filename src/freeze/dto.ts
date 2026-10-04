import { IsOptional, IsString, Matches } from 'class-validator';

export class FreezeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?$/, {
    message: 'range must be "YYYY-MM-DD" or "YYYY-MM-DD..YYYY-MM-DD"',
  })
  range!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
