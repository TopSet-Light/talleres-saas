import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { normalizeEmail, TOKEN_PATTERN, trimText } from '../../common/tokens';
import { PASSWORD_MAX, PASSWORD_MIN } from './password.service';

const EMAIL = 'Ingresá un email válido.';
const PASSWORD = `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`;

export class EmailField {
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @MaxLength(254, { message: EMAIL })
  @IsEmail({}, { message: EMAIL })
  email!: string;
}

// Sin contraseña: se elige al abrir el enlace del email (revisión de TS-19).
export class RegisterDto extends EmailField {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString({ message: 'Ingresá el nombre del taller.' })
  @Length(2, 160, { message: 'El nombre del taller debe tener entre 2 y 160 caracteres.' })
  workshopName!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString({ message: 'Ingresá tu nombre.' })
  @Length(2, 160, { message: 'Tu nombre debe tener entre 2 y 160 caracteres.' })
  ownerName!: string;
}

export class LoginDto extends EmailField {
  @IsString({ message: 'Ingresá tu contraseña.' })
  @Length(1, PASSWORD_MAX, { message: 'Ingresá tu contraseña.' })
  password!: string;
}

export class TokenDto {
  @IsString({ message: 'El enlace no es válido.' })
  @Matches(TOKEN_PATTERN, { message: 'El enlace no es válido.' })
  token!: string;
}

export class CompleteRegistrationDto extends TokenDto {
  @IsString({ message: PASSWORD })
  @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD })
  password!: string;
}
