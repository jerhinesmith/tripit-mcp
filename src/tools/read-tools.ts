import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TripService } from "../services/trip-service.js";

type Deps = { service: TripService };

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerReadTools(server: McpServer, deps: Deps): void {
  const { service } = deps;

  server.registerTool(
    "tripit_whoami",
    {
      description: "Current TripIt profile: name, home city/airport, pro status, ical feed URL.",
      inputSchema: {},
    },
    async () => text(await service.whoami()),
  );

  server.registerTool(
    "tripit_list_trips",
    {
      description: "List trips (upcoming by default), soonest first.",
      inputSchema: { past: z.boolean().optional(), limit: z.number().int().positive().optional() },
    },
    async (args: { past?: boolean; limit?: number }) =>
      text(await service.listTrips({ past: args.past, pageSize: args.limit })),
  );

  server.registerTool(
    "tripit_get_trip",
    {
      description: "Full itinerary for one trip: flights, hotels, car rentals, and activities.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => text(await service.getTrip(args.uuid)),
  );

  server.registerTool(
    "tripit_list_alerts",
    {
      description: "Active TripIt Pro alerts (schedule changes, advisories, etc.).",
      inputSchema: {},
    },
    async () => text(await service.listAlerts()),
  );
}
