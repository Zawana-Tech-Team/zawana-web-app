import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { firebaseAdminAuth } from "../src/services/firebaseAdmin.js";

const users = await prisma.user.findMany({
  select: { id: true, email: true, phone: true, firebaseUid: true, role: true },
});
const duplicated = (values: string[]) => values.length - new Set(values).size;
let combinedPhonePassword = 0,
  unreadable = 0;
if (process.argv.includes("--verify-firebase")) {
  for (const user of users) {
    if (!user.firebaseUid) continue;
    try {
      const identity = await firebaseAdminAuth().getUser(user.firebaseUid);
      if (
        identity.providerData.some((p) => p.providerId === "phone") &&
        identity.providerData.some((p) => p.providerId === "password")
      )
        combinedPhonePassword++;
    } catch {
      unreadable++;
    }
  }
}
console.log(
  JSON.stringify(
    {
      users: users.length,
      establishedUidMappings: users.filter((u) => u.firebaseUid).length,
      normalizedEmailCollisions: duplicated(
        users.map((u) => u.email.toLowerCase()),
      ),
      displayPhoneDuplicates: duplicated(
        users.map((u) => u.phone).filter((p): p is string => Boolean(p)),
      ),
      combinedPhonePassword,
      unreadable,
      mode: "read-only",
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
