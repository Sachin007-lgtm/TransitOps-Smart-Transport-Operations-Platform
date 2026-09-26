const { query, pool } = require('../src/config/db');
const { hashPassword } = require('../src/utils/credentials');

const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'TransitOps@2026';

const ADMINS = [
  { name: 'Ayush Pratap Singh', email: 'ayush@transitops.com' },
  { name: 'Sachin Singh', email: 'sachin@transitops.com' },
  { name: 'Shruti Keshri', email: 'shruti@transitops.com' },
  { name: 'Priyanshu Sharma', email: 'priyanshu@transitops.com' },
  { name: 'Abhimanyu Sharma', email: 'abhimanyu@transitops.com' }
];

const PRESERVED_TEST_ADMIN_EMAIL = 'admin@transitops.com';

async function seedAdmins() {
  console.log('Seeding Platform Admins...');
  try {
    // 1. Get Platform Admin role ID
    const roleRes = await query("SELECT id FROM roles WHERE name = 'Platform Admin'");
    if (roleRes.rows.length === 0) {
      throw new Error("Role 'Platform Admin' does not exist in roles table.");
    }
    const adminRoleId = roleRes.rows[0].id;

    // 2. Hash shared password
    const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);

    // 3. Upsert the 5 team admins
    for (const admin of ADMINS) {
      const existing = await query("SELECT id FROM users WHERE email = $1", [admin.email]);
      if (existing.rows.length > 0) {
        await query(`
          UPDATE users
          SET name = $1,
              password_hash = $2,
              role_id = $3,
              organization_id = NULL,
              driver_id = NULL,
              is_active = TRUE,
              must_change_password = FALSE,
              updated_at = CURRENT_TIMESTAMP
          WHERE email = $4
        `, [admin.name, passwordHash, adminRoleId, admin.email]);
        console.log(`Updated existing Platform Admin: ${admin.name} <${admin.email}>`);
      } else {
        await query(`
          INSERT INTO users (
            name, email, password_hash, role_id,
            organization_id, driver_id, is_active, must_change_password
          ) VALUES ($1, $2, $3, $4, NULL, NULL, TRUE, FALSE)
        `, [admin.name, admin.email, passwordHash, adminRoleId]);
        console.log(`Created new Platform Admin: ${admin.name} <${admin.email}>`);
      }
    }

    // 4. Ensure test admin exists (Password123!)
    const testAdminExisting = await query("SELECT id FROM users WHERE email = $1", [PRESERVED_TEST_ADMIN_EMAIL]);
    if (testAdminExisting.rows.length === 0) {
      const testHash = await hashPassword('Password123!');
      await query(`
        INSERT INTO users (
          name, email, password_hash, role_id,
          organization_id, driver_id, is_active, must_change_password
        ) VALUES ('Platform Administrator', $1, $2, $3, NULL, NULL, TRUE, FALSE)
      `, [PRESERVED_TEST_ADMIN_EMAIL, testHash, adminRoleId]);
      console.log(`Created test Platform Admin: <${PRESERVED_TEST_ADMIN_EMAIL}>`);
    }

    // 5. Purge any extra platform admin accounts not in the approved whitelist
    const allAllowedEmails = [PRESERVED_TEST_ADMIN_EMAIL, ...ADMINS.map(a => a.email)];
    const purgeRes = await query(`
      DELETE FROM users
      WHERE role_id = $1 AND email != ALL($2::text[])
      RETURNING id, email
    `, [adminRoleId, allAllowedEmails]);

    if (purgeRes.rows.length > 0) {
      console.log(`Purged ${purgeRes.rows.length} unauthorized platform admin account(s):`, purgeRes.rows.map(r => r.email));
    } else {
      console.log('No extraneous platform admins found.');
    }

    // 6. Verify final list in DB
    const finalAdmins = await query(`
      SELECT u.id, u.name, u.email, r.name as role, u.is_active
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = 'Platform Admin'
      ORDER BY u.email ASC
    `);

    console.log('\n--- Final Platform Admin Registry ---');
    console.table(finalAdmins.rows);
    console.log(`Shared default password for team: ${DEFAULT_ADMIN_PASSWORD}`);
    console.log('All admins seeded successfully!\n');
  } catch (err) {
    console.error('Failed to seed platform admins:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmins();
