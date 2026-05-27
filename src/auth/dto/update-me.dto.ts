import { IsString, IsOptional, Matches } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @Matches(/^[0-9]{10,11}$/, { message: 'Geçerli bir telefon numarası giriniz' })
  phone?: string;
}
