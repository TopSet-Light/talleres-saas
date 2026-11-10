import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { trimText } from '../../common/tokens';
import { EmailField, TokenDto } from '../auth/dto';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/password.service';

export const ROLES = ['OWNER', 'RECEPTION', 'MECHANIC'] as const;
const ROLE = 'Elegí un rol válido: Dueño/Administrador, Recepción o Mecánico.';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsIn(ROLES, { message: ROLE })
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Elegí un estado válido.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class CreateInvitationDto extends EmailField {
  @IsIn(ROLES, { message: ROLE })
  role!: (typeof ROLES)[number];
}

export class AcceptInvitationDto extends TokenDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString({ message: 'Ingresá tu nombre.' })
  @Length(2, 160, { message: 'Tu nombre debe tener entre 2 y 160 caracteres.' })
  name!: string;

  @IsString({ message: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.` })
  @Length(PASSWORD_MIN, PASSWORD_MAX, { message: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.` })
  password!: string;
}
