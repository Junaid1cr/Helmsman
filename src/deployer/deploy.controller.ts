import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DeployerService, type DeployAck } from './deployer.service';
import { DeployDto } from './dto';

@Controller()
export class DeployController {
  constructor(private readonly deployer: DeployerService) {}

  /** Manually deploy a commit (respects CD gates). 202 + run id; runs in bg. */
  @Post('deploy')
  @HttpCode(HttpStatus.ACCEPTED)
  deploy(@Body() dto: DeployDto): DeployAck {
    return this.deployer.requestManualDeploy(dto);
  }

  /** Approve a queued (awaiting_approval) deploy. */
  @Post('deploy/:id/approve')
  @HttpCode(HttpStatus.ACCEPTED)
  approve(@Param('id') id: string): DeployAck {
    return this.deployer.approve(id);
  }

  /** Roll back to the previous live commit. */
  @Post('rollback')
  @HttpCode(HttpStatus.ACCEPTED)
  rollback(): DeployAck {
    return this.deployer.rollback();
  }
}
