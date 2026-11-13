import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { Access, CurrentAccess, RequirePermission } from '../auth/access';
import { AccessGuard } from '../auth/access.guard';
import { UpdateEmployeeDto } from './dto';
import { EmployeesService } from './employees.service';

// eslint-disable-next-line no-useless-assignment -- La regla no detecta el uso en el decorador de parámetro de NestJS.
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('employees')
@UseGuards(AccessGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermission('employees.read')
  list(@CurrentAccess() access: Access) {
    return this.employees.list(access);
  }

  @Patch(':id')
  @RequirePermission('employees.changeRole')
  update(@CurrentAccess() access: Access, @Param('id', uuid) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(access, id, dto);
  }
}
