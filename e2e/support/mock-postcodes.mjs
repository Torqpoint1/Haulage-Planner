// A stand-in for postcodes.io during end-to-end tests: known postcodes return
// their real coordinates, anything else is "not found". Lets tests prove that
// a postcode places the correct pin without depending on the internet.
import { createServer } from "node:http";

export const POSTCODES = {
  "GL5 3QF": { latitude: 51.73602, longitude: -2.22381, admin_district: "Stroud" },
  "GL1 2BB": { latitude: 51.86142, longitude: -2.24412, admin_district: "Gloucester" },
  "GL50 1HX": { latitude: 51.89965, longitude: -2.07846, admin_district: "Cheltenham" },
  "NP20 4AA": { latitude: 51.58731, longitude: -2.99771, admin_district: "Newport" },
  "SN1 4DD": { latitude: 51.56291, longitude: -1.78104, admin_district: "Swindon" },
  "CF10 1EP": { latitude: 51.48023, longitude: -3.17919, admin_district: "Cardiff" },
  "B1 1AA": { latitude: 52.47862, longitude: -1.90872, admin_district: "Birmingham" },
  "WR1 2EY": { latitude: 52.19216, longitude: -2.22006, admin_district: "Worcester" },
};

const port = Number(process.env.MOCK_POSTCODES_PORT ?? 3199);

createServer((req, res) => {
  const match = /^\/postcodes\/(.+)$/.exec(req.url ?? "");
  const postcode = match
    ? decodeURIComponent(match[1]).toUpperCase().replace(/\s+/g, " ").trim()
    : "";
  const hit = POSTCODES[postcode];
  res.setHeader("content-type", "application/json");
  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true }));
  } else if (hit) {
    res.end(JSON.stringify({ status: 200, result: { postcode, ...hit } }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ status: 404, error: "Postcode not found" }));
  }
}).listen(port, () => console.log(`Mock postcodes.io on ${port}`));
