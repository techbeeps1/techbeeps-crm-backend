const Customer = require('../models/customer');
const Invoice = require('../models/invoice');
const Finance = require('../models/finance');
const JobSchedule = require('../models/jobSchedule');
const Lead = require('../models/lead');
const NewsItems = require('../models/Communication/newsItems');

exports.getDashboardKpis = async (req, res) => {
  try {
    const userRole = req.user?.role || 'Staff';

    // 1. Financials (Available to Admin and Management)
    const invoices = await Invoice.find().select('total paid subTotal Status payment createdAt');
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let paidCount = 0;
    let pendingCount = 0;

    for (const inv of invoices) {
      const t = Number(inv.total) || 0;
      const p = Number(inv.paid) || 0;
      const bal = Math.max(0, t - p);

      totalInvoiced += t;
      totalPaid += p;
      totalOutstanding += bal;

      if (p >= t && t > 0) {
        paidCount++;
      } else {
        pendingCount++;
      }
    }

    // 2. CRM Metrics
    const totalCustomers = await Customer.countDocuments();
    const totalLeads = await Lead.countDocuments();
    const convertedLeads = await Lead.countDocuments({ status: 'Converted' });
    const activeLeads = await Lead.countDocuments({
      status: { $nin: ['Converted', 'Not Interested', 'Lost'] },
    });
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

    // 3. Operations & Jobs
    const totalJobs = await JobSchedule.countDocuments();
    const activeJobs = await JobSchedule.countDocuments({
      status: { $nin: ['COMPLETED', 'CANCELLED', 'Draft', 'draft'] },
    });
    const completedJobs = await JobSchedule.countDocuments({ status: 'COMPLETED' });

    // 4. Quotes & Offers
    const totalQuotes = await Finance.countDocuments();
    const acceptedQuotes = await Finance.countDocuments({ status: 'Accepted' });
    const quoteAcceptanceRate = totalQuotes > 0 ? Number(((acceptedQuotes / totalQuotes) * 100).toFixed(1)) : 0;

    // 5. Recent Announcements (Scoped by visibility)
    const newsFilter = {};
    if (userRole !== 'Admin' && userRole !== 'Manager') {
      newsFilter.publishAt = { $lte: new Date() };
    }
    const recentNews = await NewsItems.find(newsFilter)
      .sort({ publishAt: -1, createdAt: -1 })
      .limit(4)
      .select('title body publishAt publisherName createdAt');

    const kpiPayload = {
      financials: {
        totalInvoiced: Number(totalInvoiced.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        collectionRatePercentage: totalInvoiced > 0 ? Number(((totalPaid / totalInvoiced) * 100).toFixed(1)) : 0,
        totalInvoicesCount: invoices.length,
        paidInvoicesCount: paidCount,
        pendingInvoicesCount: pendingCount,
      },
      crm: {
        totalCustomers,
        totalLeads,
        activeLeads,
        convertedLeads,
        conversionRatePercentage: conversionRate,
      },
      operations: {
        totalJobs,
        activeJobs,
        completedJobs,
      },
      quotes: {
        totalQuotes,
        acceptedQuotes,
        acceptanceRatePercentage: quoteAcceptanceRate,
      },
      recentAnnouncements: recentNews.map(n => ({
        id: n._id,
        _id: n._id,
        title: n.title,
        body: n.body,
        publishAt: n.publishAt || n.createdAt,
        publisherName: n.publisherName || 'Management',
      })),
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      data: kpiPayload,
    });
  } catch (error) {
    console.error('[getDashboardKpis error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard KPIs',
      error: error.message,
    });
  }
};

