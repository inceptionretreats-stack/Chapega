// Development fixture only. This script never accepts a server URL or real
// credentials, and refuses any backend other than the local JSON adapter.
const origin = "http://127.0.0.1:3340";
if (!process.argv.includes("--seed-local-capture")) {
  throw new Error("Use --seed-local-capture with the isolated local capture server.");
}

async function json(path, options) {
  const response = await fetch(origin + path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`Local demo request failed: ${response.status} ${path}`);
  return body;
}

const ready = await json("/api/readyz");
if (ready.backend !== "local" || ready.status !== "ready") {
  throw new Error("Refusing to seed a non-local backend.");
}
const auth = await json("/api/studio-app/v1/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "owner@chapega.com",
    password: "Chapega@2026", // Published local preview fixture; never a real account.
    device: {
      installationId: "2318277c-fd4b-42a6-962a-f2dc55555555",
      platform: "android",
      model: "Local store capture fixture",
      appVersion: "1.0.0",
    },
  }),
});
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` };

try {
  const snapshot = await json("/api/vendor/chapega/bootstrap", { headers });
  if (
    snapshot.vendor.id !== "00000000-0000-4000-8000-000000000001" ||
    snapshot.user.email !== "owner@chapega.com"
  ) {
    throw new Error("Refusing an unexpected local capture identity.");
  }
  const products = snapshot.products.filter(
    (product) => product.visible && !product.archived && product.stock > 0,
  );
  if (products.length < 6) throw new Error("The local demo catalogue needs six stocked products.");
  const names = [
    "Alex Sample",
    "Sam Sample",
    "Taylor Sample",
    "Jordan Sample",
    "Casey Sample",
    "Morgan Sample",
  ];
  const stages = [
    ["confirmed"],
    ["confirmed"],
    ["confirmed", "preparing"],
    ["confirmed", "preparing"],
    ["confirmed", "preparing", "ready"],
    [],
  ];
  let created = 0;
  for (let index = 0; index < names.length; index++) {
    const idempotencyKey = `play-store-capture-20261031-${index}`;
    if (snapshot.orders.some((order) => order.idempotencyKey === idempotencyKey)) continue;
    const placed = await json("/api/kiosk/chapega/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey,
        kioskName: "Main Entrance",
        customer: {
          customerName: names[index],
          customerPhone: "",
          giftNote: index % 2 ? "A little thank you" : "Happy birthday!",
          orderNote: "Demo order",
        },
        items: [{ productId: products[index].id, quantity: 1, giftWrapped: false }],
      }),
    });
    let order = placed.order;
    for (const status of stages[index]) {
      const updated = await json(`/api/vendor/chapega/orders/${order.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status, version: order.version }),
      });
      order = updated.order;
    }
    created++;
  }
  console.log(
    JSON.stringify({ localOnly: true, syntheticOrdersCreated: created, expectedFixtureOrders: 6 }),
  );
} finally {
  await json("/api/studio-app/v1/logout", { method: "POST", headers });
}
