import bcrypt from 'bcryptjs';
import { exec, pool } from '../src/db';

async function main() {
  await exec(`INSERT IGNORE INTO service_categories (category_id, name, icon, status) VALUES
    (1,'Kitchen','kitchen',true),(2,'Bathroom','bathroom',true),(3,'Electrical','electrical',true),(4,'Plumbing','plumbing',true),(5,'Waterproofing','waterproofing',true),(6,'AC Service','ac',true)`);
  const hash = await bcrypt.hash('ChangeMe@123', 10);
  await exec(`INSERT IGNORE INTO staff (id, name, email, password_hash, is_active) VALUES (1, 'Chris Admin', 'admin@vayil.in', :hash, true)`, { hash });
  await exec(`INSERT IGNORE INTO staff_roles (staff_id, role_id) SELECT 1, id FROM roles WHERE name='super_admin'`);
  console.log('Seed complete. Default staff: admin@vayil.in / ChangeMe@123');
  await pool.end();
}
main().catch((err) => { console.error(err); process.exit(1); });
