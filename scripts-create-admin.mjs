import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }});
const email = 'info@minbilvardering.se';
const password = 'Minbilvardering2026!';

const { data: existing } = await admin.auth.admin.listUsers();
const found = existing.users.find(u => u.email === email);
let userId;
if (found) {
  userId = found.id;
  console.log('Existerar redan:', userId);
  const upd = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true, user_metadata: { name: 'Admin', role: 'admin' }});
  if (upd.error) console.error('update err', upd.error);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: 'Admin', role: 'admin' },
  });
  if (error) { console.error(error); process.exit(1); }
  userId = data.user.id;
  console.log('Skapad:', userId);
}
// Säkerställ profil-rollen
const { error: pErr } = await admin.from('profiles').upsert({ id: userId, email, name: 'Admin', role: 'admin', status: 'active' }, { onConflict: 'id' });
if (pErr) console.error('profile err', pErr);
console.log('Klar.');
