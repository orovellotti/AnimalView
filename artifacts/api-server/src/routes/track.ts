import { Router, type IRouter } from "express";
import { GetTrackQueryParams, GetTrackResponse } from "@workspace/api-zod";
import { generateDemoTrack } from "../lib/demoData";
import { hasMovebank } from "../lib/providers";

const router: IRouter = Router();

async function fetchMovebankTrack(
  studyId: string,
  individualId: string,
  from?: string,
  to?: string,
): Promise<{ lat: number; lon: number; timestamp: string }[] | null> {
  const user = process.env["MOVEBANK_USERNAME"];
  const pass = process.env["MOVEBANK_PASSWORD"];
  if (!user || !pass) return null;
  // Movebank "Lite" CSV/JSON endpoint. Public studies only without explicit license acceptance.
  const params = new URLSearchParams({
    entity_type: "event",
    study_id: studyId,
    individual_local_identifiers: individualId,
  });
  if (from) params.set("timestamp_start", from);
  if (to) params.set("timestamp_end", to);
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const r = await fetch(
    `https://www.movebank.org/movebank/service/direct-read?${params}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!r.ok) return null;
  const text = await r.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",");
  const iLon = header.indexOf("location-long");
  const iLat = header.indexOf("location-lat");
  const iTs = header.indexOf("timestamp");
  if (iLon < 0 || iLat < 0 || iTs < 0) return null;
  const points: { lat: number; lon: number; timestamp: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push({ lat, lon, timestamp: cols[iTs] ?? "" });
  }
  return points;
}

router.get("/track", async (req, res) => {
  const parsed = GetTrackQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "studyId and individualId are required" });
    return;
  }
  const { studyId, individualId, from, to } = parsed.data;
  let points: { lat: number; lon: number; timestamp: string }[] | null = null;
  let mode = "demo";
  if (hasMovebank() && !studyId.startsWith("demo-")) {
    try {
      points = await fetchMovebankTrack(studyId, individualId, from, to);
      if (points && points.length > 0) mode = "real";
    } catch (err) {
      req.log.warn({ err }, "movebank fetch failed, falling back to demo");
    }
  }
  if (!points || points.length === 0) {
    points = generateDemoTrack(studyId, individualId);
    mode = "demo";
  }
  const data = GetTrackResponse.parse({
    studyId,
    individualId,
    mode,
    points,
  });
  res.json(data);
});

export default router;
