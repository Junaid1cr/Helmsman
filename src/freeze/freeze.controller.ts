import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { Freeze } from '../store/types';
import { FreezeDto } from './dto';

@Controller('freeze')
export class FreezeController {
  constructor(private readonly store: StoreService) {}

  @Get()
  list(): Freeze[] {
    return this.store.listFreezes();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: FreezeDto): Freeze {
    return this.store.createFreeze({ range: dto.range, reason: dto.reason });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string): { id: string; removed: true } {
    if (!this.store.deleteFreeze(id)) throw new NotFoundException(`freeze ${id} not found`);
    return { id, removed: true };
  }
}
