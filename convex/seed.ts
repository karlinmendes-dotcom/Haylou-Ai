import { mutation } from "./_generated/server";

export const seedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const devices = await ctx.db.query("devices").collect();
    if (devices.length > 0) return;

    await ctx.db.insert("devices", {
      name: "Haylou Solar Plus RT3",
      model: "LS16",
      battery: 87,
      firmware: "1.2.4",
      lastSync: Date.now(),
      status: "online",
    });
    await ctx.db.insert("devices", {
      name: "Haylou Solar Lite",
      model: "LS02",
      battery: 42,
      firmware: "1.0.9",
      lastSync: Date.now() - 86400000,
      status: "offline",
    });

    await ctx.db.insert("sessions", {
      deviceName: "Haylou Solar Plus RT3",
      startedAt: Date.now() - 3600000,
      endedAt: Date.now() - 1800000,
      type: "exercicio",
    });
    await ctx.db.insert("sessions", {
      deviceName: "Haylou Solar Plus RT3",
      startedAt: Date.now() - 7200000,
      type: "sono",
    });

    await ctx.db.insert("settings", { key: "language", value: "pt-BR" });
    await ctx.db.insert("settings", { key: "unit", value: "metric" });
    await ctx.db.insert("settings", { key: "notifications", value: "enabled" });
  },
});
