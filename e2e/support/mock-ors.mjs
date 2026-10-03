// A stand-in for OpenRouteService during end-to-end tests. Roads are modelled
// as the straight line × 1.25 at 40 mph, with a bend in the middle, so tests
// can tell road distances (from "the provider") apart from the app's own
// straight-line × 1.3 estimate.
import { createServer } from "node:http";

const port = Number(process.env.MOCK_ORS_PORT ?? 3198);
const ROAD = 1.25;
const MPS = (40 * 1609.344) / 3600;

function metres([lng1, lat1], [lng2, lat2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(h)) * ROAD;
}

function read(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
  });
}

createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/health") return res.end(JSON.stringify({ ok: true }));

  if (req.method === "POST" && req.url === "/v2/directions/driving-hgv/geojson") {
    const { coordinates = [] } = await read(req);
    const line = [coordinates[0]];
    const wayPoints = [0];
    const segments = [];
    for (let i = 1; i < coordinates.length; i++) {
      const [a, b] = [coordinates[i - 1], coordinates[i]];
      const bend = [(a[0] + b[0]) / 2 + 0.01, (a[1] + b[1]) / 2 + 0.01];
      line.push(bend, b);
      wayPoints.push(line.length - 1);
      const distance = metres(a, b);
      segments.push({ distance, duration: distance / MPS });
    }
    return res.end(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: line },
            properties: { segments, way_points: wayPoints },
          },
        ],
      }),
    );
  }

  if (req.method === "POST" && req.url === "/v2/matrix/driving-hgv") {
    const { locations = [] } = await read(req);
    const distances = locations.map((a) => locations.map((b) => metres(a, b)));
    return res.end(
      JSON.stringify({ distances, durations: distances.map((row) => row.map((d) => d / MPS)) }),
    );
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
}).listen(port, () => console.log(`mock ORS on ${port}`));
