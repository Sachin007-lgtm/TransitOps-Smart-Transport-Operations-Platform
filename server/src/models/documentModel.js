const { query } = require('../config/db');

function assertOrganizationId(orgId, methodName) {
  if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error(`organization_id is mandatory for Document.${methodName}`);
  }
}

const Document = {
  /**
   * Upsert a document for an entity
   */
  upsert: async (documentData, organization_id) => {
    assertOrganizationId(organization_id, 'upsert');
    const { entity_type, entity_id, document_type, file_url, issue_date, expiry_date } = documentData;

    const sql = `
      INSERT INTO documents (organization_id, entity_type, entity_id, document_type, file_url, issue_date, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (organization_id, entity_type, entity_id, document_type) 
      DO UPDATE SET 
        file_url = EXCLUDED.file_url,
        issue_date = EXCLUDED.issue_date,
        expiry_date = EXCLUDED.expiry_date,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await query(sql, [organization_id, entity_type, entity_id, document_type, file_url, issue_date || null, expiry_date]);
    return result.rows[0];
  },

  /**
   * Get documents for a specific entity
   */
  findByEntity: async (entity_type, entity_id, organization_id) => {
    assertOrganizationId(organization_id, 'findByEntity');

    const sql = `
      SELECT *,
        CASE 
          WHEN expiry_date < CURRENT_DATE THEN 'Expired'
          WHEN expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'Expiring Soon'
          ELSE 'Valid' 
        END as status
      FROM documents
      WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY document_type
    `;
    const result = await query(sql, [organization_id, entity_type, entity_id]);
    return result.rows;
  },

  /**
   * Get all expiring/expired documents across the organization (for dashboard alerts)
   */
  findAlerts: async (organization_id) => {
    assertOrganizationId(organization_id, 'findAlerts');

    const sql = `
      SELECT d.*,
        CASE 
          WHEN d.expiry_date < CURRENT_DATE THEN 'Expired'
          ELSE 'Expiring Soon'
        END as status,
        CASE WHEN d.entity_type = 'DRIVER' THEN dr.name ELSE v.registration_number END as entity_name
      FROM documents d
      LEFT JOIN drivers dr ON d.entity_type = 'DRIVER' AND dr.id = d.entity_id
      LEFT JOIN vehicles v ON d.entity_type = 'VEHICLE' AND v.id = d.entity_id
      WHERE d.organization_id = $1 
        AND d.expiry_date < CURRENT_DATE + INTERVAL '30 days'
      ORDER BY d.expiry_date ASC
    `;
    const result = await query(sql, [organization_id]);
    return result.rows;
  }
};

module.exports = Document;
