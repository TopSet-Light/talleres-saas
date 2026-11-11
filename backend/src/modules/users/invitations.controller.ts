import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Access, CurrentAccess, RequirePermission } from '../auth/access';
import { AccessGuard } from '../auth/access.guard';
import { TokenDto } from '../auth/dto';
import { AcceptInvitationDto, CreateInvitationDto } from './dto';
import { InvitationsService } from './invitations.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @UseGuards(AccessGuard)
  @RequirePermission('employees.invite')
  list(@CurrentAccess() access: Access) {
    return this.invitations.listPending(access);
  }

  @Post()
  @UseGuards(AccessGuard)
  @RequirePermission('employees.invite')
  create(@CurrentAccess() access: Access, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(access, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AccessGuard)
  @RequirePermission('employees.invite')
  async revoke(@CurrentAccess() access: Access, @Param('id', uuid) id: string) {
    await this.invitations.revoke(access, id);
  }

  // Rutas públicas: la autorización es la posesión del token de la invitación.
  @Post('preview')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  preview(@Body() dto: TokenDto) {
    return this.invitations.preview(dto.token);
  }

  @Post('accept')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  async accept(@Body() dto: AcceptInvitationDto) {
    await this.invitations.accept(dto);
    return { message: 'Te sumaste al taller. Ya podés iniciar sesión.' };
  }
}
