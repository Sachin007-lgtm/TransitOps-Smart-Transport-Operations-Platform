const { authService, AuthServiceError } = require('../services/authService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

function handleError(res, error) {
	if (error instanceof AuthServiceError) return apiResponse.error(res, error.message, error.statusCode);
	console.error('Unexpected Auth Error:', error);
	return apiResponse.error(res, 'Authentication failed.', 500);
}

const login = asyncWrapper(async (req, res) => {
	try {
		const { phone_number, email, identifier, password } = req.body;
		const loginTarget = identifier || email || phone_number;
		const result = await authService.login(loginTarget, password);
		return apiResponse.success(res, result, 'Login successful.');
	} catch (error) {
		return handleError(res, error);
	}
});

const me = asyncWrapper(async (req, res) => {
	try {
		const user = await authService.currentUser(req.user.id);
		return apiResponse.success(res, user, 'Current user retrieved successfully.');
	} catch (error) {
		return handleError(res, error);
	}
});

const changePassword = asyncWrapper(async (req, res) => {
	try {
		const { current_password, new_password } = req.body;
		await authService.changePassword(req.user.id, current_password, new_password);
		return apiResponse.success(res, null, 'Password changed successfully.');
	} catch (error) {
		return handleError(res, error);
	}
});

module.exports = { login, me, changePassword };
