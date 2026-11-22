import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContactListsService } from './contact-lists.service';
import {
  AddByFilterDto,
  ContactIdsDto,
  CreateContactListDto,
  ListMembersQueryDto,
  UpdateContactListDto,
} from './dto/contact-list.dto';

@ApiTags('admin-messaging')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/contact-lists')
export class ContactListsController {
  constructor(private readonly lists: ContactListsService) {}

  @Get()
  list() {
    return this.lists.list();
  }

  @Post()
  create(
    @Body() dto: CreateContactListDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.lists.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactListDto,
  ) {
    return this.lists.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.lists.remove(id);
  }

  @Get(':id/members')
  members(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.lists.members(id, query);
  }

  @Post(':id/members')
  addContacts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactIdsDto,
  ) {
    return this.lists.addContacts(id, dto);
  }

  @Post(':id/members/by-filter')
  addByFilter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddByFilterDto,
  ) {
    return this.lists.addByFilter(id, dto);
  }

  @Delete(':id/members')
  removeContacts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactIdsDto,
  ) {
    return this.lists.removeContacts(id, dto);
  }
}
