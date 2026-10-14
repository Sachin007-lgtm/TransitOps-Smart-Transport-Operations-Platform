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
		const { phone_number, email, identifier, password, client, client_type } = req.body || {};
		const clientType = client || client_type || req.headers['x-client-type'];
		const loginTarget = identifier || email || phone_number;
		const result = await authService.login(loginTarget, password, clientType);
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
		const { current_password, new_password } = req.body || {};
		await authService.changePassword(req.user.id, current_password, new_password);
		return apiResponse.success(res, null, 'Password changed successfully.');
	} catch (error) {
		return handleError(res, error);
	}
});

const updateProfile = asyncWrapper(async (req, res) => {
	try {
		const { name, email, phone_number, avatar_url } = req.body || {};
		const updated = await authService.updateProfile(req.user.id, { name, email, phone_number, avatar_url });
		return apiResponse.success(res, updated, 'Profile updated successfully.');
	} catch (error) {
		return handleError(res, error);
	}
});

module.exports = { login, me, changePassword, updateProfile };
