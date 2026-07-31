import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from '../common/schemas/client.schema';
import { Subscription, SubscriptionDocument } from '../common/schemas/subscription.schema';
import { Enquiry, EnquiryDocument } from '../common/schemas/enquiry.schema';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Client.name)       private clientModel: Model<ClientDocument>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    @InjectModel(Enquiry.name)      private enquiryModel: Model<EnquiryDocument>,
    private auditLog: AuditLogService,
  ) {}

  async stats() {
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 86400_000);

    const [
      clientsTotal,
      clientsActive,
      subscriptionsActive,
      enquiriesNew,
      enquiriesUnassigned,
      expiringSoon,
      recentActivity,
    ] = await Promise.all([
      this.clientModel.countDocuments(),
      this.clientModel.countDocuments({ status: 'ACTIVE' }),
      this.subModel.countDocuments({ status: 'ACTIVE' }),
      this.enquiryModel.countDocuments({ status: 'NEW' }),
      this.enquiryModel.countDocuments({ assignedToId: { $exists: false } }),
      this.subModel.countDocuments({
        status: 'ACTIVE',
        endDate: { $gte: now.toISOString(), $lte: thirtyDaysOut.toISOString() },
      }),
      this.auditLog.listRecent(8),
    ]);

    // Revenue: sum of amountPaid across all active subscriptions
    const revenueAgg = await this.subModel.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: null, total: { $sum: '$amountPaid' }, outstanding: { $sum: { $subtract: ['$totalPrice', '$amountPaid'] } } } },
    ]);
    const revenue = revenueAgg[0] ?? { total: 0, outstanding: 0 };

    // Monthly payment trend (last 6 months) — group payments by month
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const trendAgg = await this.subModel.aggregate([
      { $match: { status: { $in: ['ACTIVE', 'EXPIRED'] } } },
      { $unwind: '$installments' },
      {
        $match: {
          'installments.dueDate': { $gte: sixMonthsAgo.toISOString() },
        },
      },
      {
        $group: {
          _id: { $substr: ['$installments.dueDate', 0, 7] },
          amount: { $sum: '$installments.amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      clientsTotal,
      clientsActive,
      subscriptionsActive,
      enquiriesNew,
      enquiriesUnassigned,
      expiringSoon,
      revenueCollected: revenue.total,
      revenueOutstanding: revenue.outstanding,
      monthlyTrend: trendAgg.map((r) => ({ month: r._id, amount: r.amount })),
      recentActivity,
      // Content stats — Sanity side; return 0 here, frontend merges with Sanity counts
      publishedProjects: 0,
      draftProjects: 0,
      contentInReview: 0,
    };
  }
}
