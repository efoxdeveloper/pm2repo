const { createUser, initializeAuth, pool } = require('./auth.cjs');

async function main() {
  const username = process.env.AUTH_ADMIN_USERNAME;
  const password = process.env.AUTH_ADMIN_PASSWORD;
  const displayName = process.env.AUTH_ADMIN_DISPLAY_NAME || 'Super Admin';
  if (!username || !password) throw new Error('Set AUTH_ADMIN_USERNAME and AUTH_ADMIN_PASSWORD for this one-time bootstrap command');

  await initializeAuth();
  const user = await createUser({ username, password, displayName });
  console.log(`Super Admin created: ${user.username}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => {});
});
