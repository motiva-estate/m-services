import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@ApiTags("Dashboard")
@ApiBearerAuth("access-token")
@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private svc: DashboardService) {}

  // GET /api/dashboard/stats
  @Get("stats")
  @ApiOperation({
    summary: "Admin dashboard stats",
    description:
      "Returns aggregate counts used by the admin overview: total clients, active subscriptions, open enquiries, payments this month, etc.",
  })
  @ApiResponse({
    status: 200,
    description: "Dashboard statistics",
    schema: {
      type: "object",
      properties: {
        totalClients: { type: "number", example: 24 },
        activeSubscriptions: { type: "number", example: 18 },
        openEnquiries: { type: "number", example: 7 },
        paymentsThisMonth: { type: "number", example: 3 },
        revenueThisMonth: { type: "number", example: 15000000 },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  stats() {
    return this.svc.stats();
  }
}
