import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Channel, ContactLifecycle, ContactType } from '@prisma/client';

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'PENDING_AGENT', 'CLOSED', 'ALL'])
  status?: 'OPEN' | 'PENDING_AGENT' | 'CLOSED' | 'ALL';

  @IsOptional()
  @IsEnum(Channel)
  channel?: Channel;

  @IsOptional()
  @IsEnum(ContactType)
  contactType?: ContactType;

  @IsOptional()
  @IsEnum(ContactLifecycle)
  lifecycleStatus?: ContactLifecycle;

  @IsOptional()
  @IsUUID('4')
  tagId?: string;

  @IsOptional()
  @IsIn(['me', 'unassigned', 'any'])
  assigned?: 'me' | 'unassigned' | 'any';

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  needsReply?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  crisis?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
