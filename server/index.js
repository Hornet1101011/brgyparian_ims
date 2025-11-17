// Bootstrap for Render: require compiled server entry if present
// This file is a small shim so Render's start command "node server/index.js" works
// It prefers the compiled `dist/index.js` produced by `npm run build` (postinstall).
try {
  // eslint-disable-next-line node/no-missing-require
  require('./dist/index.js');
} catch (err) {
  console.error('Failed to require ./dist/index.js — ensure the project was built. Error:', err && err.message);
  console.error('If TypeScript was not compiled, run `npm run build` in the server directory.');
  process.exit(1);
}
