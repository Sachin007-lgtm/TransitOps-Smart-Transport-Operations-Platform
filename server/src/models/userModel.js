const { query } = require('../config/db');

const User = {
  /**
   * Find a user by email (used during login).
   */
  findByEmail: async (email) => {
    const sql = `
      SELECT u.*, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1;
    `;
    const result = await query(sql, [email]);
    return result.rows[0];
  },

  /**
   * Find a user by primary key (used to attach user to req after JWT verify).
   */
  findById: async (id) => {
    const sql = `
      SELECT u.id, u.name, u.email, u.role_id, r.name AS role_name, u.created_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  /**
   * Create a new user.
   */
  create: async ({ name, email, password_hash, role_id }) => {
    const sql = `
      INSERT INTO users (name, email, password_hash, role_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role_id, created_at;
    `;
    const result = await query(sql, [name, email, password_hash, role_id]);
    return result.rows[0];
  },

  /**
   * Get all users (admin view).
   */
  findAll: async () => {
    const sql = `
      SELECT u.id, u.name, u.email, u.role_id, r.name AS role_name, u.created_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC;
    `;
    const result = await query(sql, []);
    return result.rows;
  }
};

module.exports = User;
