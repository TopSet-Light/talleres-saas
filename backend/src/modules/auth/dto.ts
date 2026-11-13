import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
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

  // Opcionales (formulario de TS-21): al completar el registro pasan a la configuración del taller.
  @Transform(({ value }: { value: unknown }) => { const text = trimText(value); return text === '' ? undefined : text; })
  @IsOptional()
  @IsString({ message: 'Ingresá un teléfono de contacto.' })
  @MaxLength(40, { message: 'El teléfono admite hasta 40 caracteres.' })
  contactPhone?: string;

  @Transform(({ value }: { value: unknown }) => { const text = trimText(value); return text === '' ? undefined : text; })
  @IsOptional()
  @IsString({ message: 'Ingresá la localidad.' })
  @MaxLength(120, { message: 'La localidad admite hasta 120 caracteres.' })
  locality?: string;

  @Transform(({ value }: { value: unknown }) => { const text = trimText(value); return text === '' ? undefined : text; })
  @IsOptional()
  @IsString({ message: 'Ingresá el domicilio.' })
  @MaxLength(300, { message: 'El domicilio admite hasta 300 caracteres.' })
  address?: string;
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

export class ResetPasswordDto extends TokenDto {
  @IsString({ message: PASSWORD })
  @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD })
  password!: string;
}

export class CompleteRegistrationDto extends TokenDto {
  @IsString({ message: PASSWORD })
  @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD })
  password!: string;
}
