const { punctualityService, PunctualityServiceError } = require('../services/punctualityService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof PunctualityServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Punctuality Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error', 500);
};

const getDriverPunctuality = asyncWrapper(async (req, res) => {
  try {
    const { driverId } = req.params;
    // Driver role can only inspect their own punctuality scorecard
    if (req.user.role === 'Driver') {
      if (!req.user.driver_id || req.user.driver_id !== driverId) {
        return apiResponse.error(res, 'Forbidden: You can only view your own punctuality scorecard.', 403);
      }
    }

    const data = await punctualityService.getDriverPunctuality(driverId, req.user.organization_id);
    return apiResponse.success(res, data, 'Driver punctuality retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getLeaderboard = asyncWrapper(async (req, res) => {
  try {
    const leaderboard = await punctualityService.getLeaderboard(req.user.organization_id);
    return apiResponse.success(res, leaderboard, 'Driver punctuality leaderboard retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  getDriverPunctuality,
  getLeaderboard
};
