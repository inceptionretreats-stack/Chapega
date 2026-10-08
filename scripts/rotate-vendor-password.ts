import { loadEnvConfig } from "@next/env";

const CONFIRMATION_FLAG = "--confirm-rotation";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  if (!process.argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Refusing to rotate credentials without ${CONFIRMATION_FLAG}.`);
  }

  const email = process.env.VENDOR_EMAIL?.trim().toLowerCase();
  const password = process.env.VENDOR_PASSWORD;
  if (!email || !password) {
    throw new Error("Set VENDOR_EMAIL and VENDOR_PASSWORD before rotating credentials.");
  }
  if (password.length < 12 || password.length > 200) {
    throw new Error("VENDOR_PASSWORD must contain 12 to 200 characters.");
  }

  // Validate before the data store is opened (opening it may seed it).
  const configModule = await import("../server/vendor/config");
  if (configModule.isPlaceholderPassword(password)) {
    throw new Error(
      "Refusing to set the .env.example placeholder password. Choose a long, unique password.",
    );
  }
  if (configModule.isKnownPreviewCredentialPair(email, password)) {
    throw new Error("Refusing to set the public preview password.");
  }

  const [{ derivePasswordHash }, databaseModule] = await Promise.all([
    import("../server/vendor/crypto"),
    import("../server/vendor/database"),
  ]);

  const derived = await derivePasswordHash(password);
  const updated = await databaseModule.updateVendorDatabase((database) => {
    const userIndex = database.users.findIndex(
      (candidate) => candidate.email === email,
    );
    const user = database.users[userIndex];
    if (!user) return false;
    database.users[userIndex] = {
      ...user,
      passwordSalt: derived.salt,
      passwordHash: derived.hash,
      active: true,
    };
    database.sessions = database.sessions.filter(
      (session) => session.userId !== user.id,
    );
    database.audit.push(
      databaseModule.newAuditRecord(
        user.id,
        "vendor.password.rotated",
        "auth",
        user.id,
      ),
    );
    database.revision += 1;
    return true;
  });
  if (!updated) throw new Error(`No vendor account exists for ${email}.`);
  console.log(`Rotated the vendor password for ${email} and revoked its sessions.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
