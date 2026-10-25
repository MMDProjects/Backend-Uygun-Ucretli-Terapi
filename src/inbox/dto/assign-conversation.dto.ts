import { IsUUID, ValidateIf } from 'class-validator';

export class AssignConversationDto {
  // null gönderilirse atama kaldırılır.
  @ValidateIf((o: AssignConversationDto) => o.userId !== null)
  @IsUUID('4')
  userId: string | null;
}
