import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { ContactsAdminService } from './contacts-admin.service';
import { ListContactsQueryDto } from './dto/contact-filter.dto';
import { UpdateOptOutDto } from './dto/update-opt-out.dto';

@ApiTags('admin-messaging')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/contacts')
export class ContactsAdminController {
  constructor(private readonly contacts: ContactsAdminService) {}

  @Get()
  list(@Query() query: ListContactsQueryDto) {
    return this.contacts.list(query);
  }

  // DUR işaretini personel elle kaldırabilir ya da koyabilir.
  @Patch(':id/opt-out')
  updateOptOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOptOutDto,
  ) {
    return this.contacts.updateOptOut(id, dto);
  }
}
