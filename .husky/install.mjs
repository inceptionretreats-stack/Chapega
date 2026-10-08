// Installs the git hooks for contributors (`npm install` runs this through
// `prepare`). Skipped in CI, production installs and when HUSKY=0.
if (process.env.CI || process.env.NODE_ENV === "production" || process.env.HUSKY === "0") {
  process.exit(0);
}
try {
  const { default: husky } = await import("husky");
  const message = husky();
  if (message) console.log(message);
} catch {
  // husky is a devDependency; it is absent from --omit=dev installs.
}
