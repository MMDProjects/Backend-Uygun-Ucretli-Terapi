import { IsBoolean } from 'class-validator';

export class TogglePublishDto {
  @IsBoolean()
  isPublished: boolean;
}
