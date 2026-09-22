const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { normalizePhoneNumber } = require('../utils/phone');
const {
	comparePassword,
	generateTemporaryPassword,
	hashPassword
} = require('../utils/credentials');

class AuthServiceError extends Error {
	constructor(message, statusCode = 400) {
		super(message);
		this.statusCode = statusCode;
	}
}

function publicUser(user) {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		phone_number: user.phone_number,
		role: user.role,
		role_id: user.role_id,
		driver_id: user.driver_id,
		organization_id: user.organization_id,
		must_change_password: user.must_change_password
	};
}

function signToken(user) {
	const secret = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
	return jwt.sign({
		id: user.id,
		email: user.email,
		phone_number: user.phone_number,
		role: user.role,
		role_id: user.role_id,
		driver_id: user.driver_id,
		organization_id: user.organization_id
	}, secret, { expiresIn: '8h' });
}

const authService = {
	login: async (identifier, password) => {
		const normalizedIdentifier = String(identifier || '').trim();
		if (!normalizedIdentifier || !password) {
			throw new AuthServiceError('Phone number and password are required.', 400);
		}

		const loginIdentifier = normalizePhoneNumber(normalizedIdentifier) || normalizedIdentifier;
		const user = await User.findByLogin(loginIdentifier);
		if (!user || user.is_active === false || !(await comparePassword(password, user.password_hash))) {
			throw new AuthServiceError('Invalid phone number or password.', 401);
		}

		return { token: signToken(user), user: publicUser(user) };
	},

	currentUser: async (id) => {
		const user = await User.findById(id);
		if (!user) throw new AuthServiceError('User not found.', 404);
		return publicUser(user);
	},

	changePassword: async (userId, currentPassword, newPassword) => {
		if (!newPassword || newPassword.length < 8) {
			throw new AuthServiceError('New password must be at least 8 characters.', 400);
		}
		const user = await User.findByIdWithPassword(userId);
		if (!user || !(await comparePassword(currentPassword, user.password_hash))) {
			throw new AuthServiceError('Current password is incorrect.', 401);
		}
		await User.updatePassword(user.id, await hashPassword(newPassword));
	},

	generateTemporaryPassword
};

module.exports = { authService, AuthServiceError, publicUser };
