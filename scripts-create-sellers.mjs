import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const password = 'Minbilvardering2026!';
const sellers = [
  { email: 'ali@minbilvardering.se', name: 'Ali' },
  { email: 'arman@minbilvardering.se', name: 'Arman' },
  { email: 'dodou@minbilvardering.se', name: 'Dodou' },
];

const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });

for (const s of sellers) {
  const found = existing.users.find((u) => u.email === s.email);
  let userId;
  if (found) {
    userId = found.id;
    const upd = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { name: s.name, role: 'seller' },
    });
    if (upd.error) console.error(s.email, 'update err', upd.error);
    else console.log(s.email, 'uppdaterad', userId);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: s.email,
      password,
      email_confirm: true,
      user_metadata: { name: s.name, role: 'seller' },
    });
    if (error) {
      console.error(s.email, error);
      continue;
    }
    userId = data.user.id;
    console.log(s.email, 'skapad', userId);
  }
  const { error: pErr } = await admin
    .from('profiles')
    .upsert(
      { id: userId, email: s.email, name: s.name, role: 'seller', status: 'active' },
      { onConflict: 'id' },
    );
  if (pErr) console.error(s.email, 'profile err', pErr);
}
console.log('Klar.');
