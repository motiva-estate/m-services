import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReceiptsService } from './receipts.service';
import { CreateReceiptDto, UpdateReceiptDto } from './dto/create-receipt.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CapabilitiesGuard, Can } from '../common/guards/capabilities.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Receipts')
@Controller('receipts')
export class ReceiptsController {
  constructor(private svc: ReceiptsService) { }

  @Post()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new receipt' })
  @ApiBody({ type: CreateReceiptDto })
  @ApiResponse({ status: 201, description: 'Receipt created successfully' })
  create(@Body() dto: CreateReceiptDto, @CurrentUser() actor: any) {
    return this.svc.create(dto, actor.id, actor.fullName);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all receipts with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'ISSUED'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of receipts',
  })
  list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.list(Number(page) || 1, Number(limit) || 20, {
      clientId,
      status,
      search,
    });
  }

  @Get('by-client/:clientId')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all receipts for a specific client' })
  @ApiParam({ name: 'clientId', description: 'Client ID' })
  @ApiResponse({ status: 200, description: 'Returns array of receipts' })
  getByClient(@Param('clientId') clientId: string) {
    return this.svc.getByClient(clientId);
  }

  @Get('verify/:receiptNumber')
  @ApiOperation({
    summary: 'Verify receipt by receipt number (public, no auth required)',
  })
  @ApiParam({
    name: 'receiptNumber',
    description: 'Receipt number (e.g., MTV-2026-0001)',
  })
  @ApiResponse({ status: 200, description: 'Returns receipt with client data' })
  async verify(@Param('receiptNumber') receiptNumber: string) {
    return this.svc.getReceiptWithClientByNumber(receiptNumber);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get single receipt by ID' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({ status: 200, description: 'Returns receipt data' })
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/with-client')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get receipt with client data' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns receipt with populated client data',
  })
  getWithClient(@Param('id') id: string) {
    return this.svc.getReceiptWithClient(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a receipt' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiBody({ type: UpdateReceiptDto })
  @ApiResponse({ status: 200, description: 'Receipt updated successfully' })
  update(@Param('id') id: string, @Body() dto: UpdateReceiptDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a receipt (only for drafts)' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({ status: 200, description: 'Receipt deleted successfully' })
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Post(':id/void')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Void a receipt (maintains audit trail)' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Receipt issued in error' }
      },
      required: ['reason']
    }
  })
  @ApiResponse({ status: 200, description: 'Receipt voided successfully' })
  void(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) {
    return this.svc.void(id, body.reason, actor.id, actor.fullName);
  }

  @Post(':id/generate-pdf')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Generate PDF for receipt' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({
    status: 200,
    description: 'PDF generated and uploaded to Cloudinary',
  })
  generatePDF(@Param('id') id: string) {
    return this.svc.generatePDF(id);
  }

  @Get(':id/download-pdf')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can('subscriptions.manage')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Download receipt PDF' })
  @ApiParam({ name: 'id', description: 'Receipt ID' })
  @ApiResponse({ status: 200, description: 'Returns PDF file' })
  async downloadPDF(@Param('id') id: string, @Res() res: Response) {
    const { buffer } = await this.svc.generatePDF(id);
    const receipt = await this.svc.get(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Receipt-${receipt.receiptNumber.replace(/\//g, '-')}.pdf"`,
    });

    res.send(buffer);
  }
}
