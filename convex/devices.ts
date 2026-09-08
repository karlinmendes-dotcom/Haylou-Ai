import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listDevices = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("devices").collect();
  },
});

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sessions").collect();
  },
});

export const listSettings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("settings").collect();
  },
});

export const addDevice = mutation({
  args: {
    name: v.string(),
    model: v.string(),
    battery: v.number(),
    firmware: v.string(),
    lastSync: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("devices", {
      name: args.name,
      model: args.model,
      battery: args.battery,
      firmware: args.firmware,
      lastSync: args.lastSync,
      status: args.status as "online" | "offline" | "syncing",
    });
  },
});
