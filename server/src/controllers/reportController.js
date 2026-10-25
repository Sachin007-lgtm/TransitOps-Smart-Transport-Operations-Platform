const reportService = require('../services/reportService');

const reportController = {
  getDashboardOverview: async (req, res, next) => {
    try {
      const data = await reportService.getDashboardOverview(req.user.organization_id, req.user);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = reportController;
