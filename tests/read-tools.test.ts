import { describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "../src/http/client.js";
import { registerReadTools } from "../src/tools/read-tools.js";

function fakeServer() {
  const handlers: Record<string, Function> = {};
  return {
    handlers,
    registerTool(name: string, _def: unknown, handler: Function) {
      handlers[name] = handler;
    },
  };
}

const service = {
  whoami: vi.fn(async () => ({ displayName: "Jamie Q. Traveler", isPro: true })),
  listTrips: vi.fn(async () => [{ id: "1", uuid: "u1", displayName: "Trip", isPrivate: false }]),
  getTrip: vi.fn(async () => ({
    trip: { id: "1", uuid: "u1" },
    flights: [],
    lodgings: [],
    cars: [],
    activities: [],
  })),
  listAlerts: vi.fn(async () => [{ id: "a1", isNew: true }]),
} as any;

describe("registerReadTools", () => {
  it("registers all four read tools", () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    expect(Object.keys(server.handlers).sort()).toEqual(
      ["tripit_get_trip", "tripit_list_alerts", "tripit_list_trips", "tripit_whoami"].sort(),
    );
  });

  it("tripit_whoami returns service.whoami() as text content", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    const out = await server.handlers.tripit_whoami({});
    expect(out.content[0].type).toBe("text");
    expect(JSON.parse(out.content[0].text)).toEqual({
      displayName: "Jamie Q. Traveler",
      isPro: true,
    });
  });

  it("tripit_list_trips forwards past/limit to the service", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    await server.handlers.tripit_list_trips({ past: true, limit: 5 });
    expect(service.listTrips).toHaveBeenCalledWith({ past: true, pageSize: 5 });
  });

  it("tripit_get_trip forwards uuid to the service", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    await server.handlers.tripit_get_trip({ uuid: "u1" });
    expect(service.getTrip).toHaveBeenCalledWith("u1");
  });

  it("tripit_list_alerts returns service.listAlerts() as text content", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    const out = await server.handlers.tripit_list_alerts({});
    expect(JSON.parse(out.content[0].text)).toEqual([{ id: "a1", isNew: true }]);
  });

  it("propagates SessionExpiredError out of a tool handler instead of swallowing it", async () => {
    const failingService = {
      ...service,
      listTrips: vi.fn(async () => {
        throw new SessionExpiredError();
      }),
    };
    const server = fakeServer();
    registerReadTools(server as any, { service: failingService });
    await expect(server.handlers.tripit_list_trips({})).rejects.toThrow(
      /run `tripit-mcp login` again/i,
    );
  });
});
