import { Router, type IRouter } from "express";
import { GetWeatherQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

// WMO weather interpretation codes → human-readable labels.
// https://open-meteo.com/en/docs (Weather variable documentation)
const WMO_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

type WeatherResult = {
  time: string;
  temperatureC: number | null;
  windSpeedKmh: number | null;
  precipitationMm: number | null;
  weatherCode: number;
  label: string;
};

// Cache by location (≈11km grid) + date+hour so playback doesn't spam the API.
const weatherCache = new Map<string, WeatherResult | null>();

router.get("/weather", async (req, res) => {
  const parsed = GetWeatherQueryParams.safeParse({
    lat: req.query["lat"],
    lon: req.query["lon"],
    timestamp: req.query["timestamp"],
  });
  if (!parsed.success) {
    res.status(400).json({ error: "invalid weather query" });
    return;
  }
  const lat = Number(parsed.data.lat);
  const lon = Number(parsed.data.lon);
  const date = new Date(parsed.data.timestamp);
  if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(date.getTime())) {
    res.status(400).json({ error: "invalid weather query" });
    return;
  }

  const day = date.toISOString().slice(0, 10);
  const hourIso = `${day}T${String(date.getUTCHours()).padStart(2, "0")}:00`;
  const cacheKey = `${lat.toFixed(1)}:${lon.toFixed(1)}:${hourIso}`;
  if (weatherCache.has(cacheKey)) {
    const cached = weatherCache.get(cacheKey);
    if (cached) {
      res.json(cached);
    } else {
      res.status(404).json({ error: "no weather data" });
    }
    return;
  }

  // Open-Meteo ERA5 historical archive — real reanalysis data, no API key.
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${day}&end_date=${day}` +
    `&hourly=temperature_2m,precipitation,wind_speed_10m,weather_code` +
    `&timezone=UTC`;

  try {
    const upstream = await fetch(url, { redirect: "error" });
    if (!upstream.ok) {
      req.log.warn({ status: upstream.status }, "weather upstream failed");
      res.status(502).json({ error: "weather unavailable" });
      return;
    }
    const j = (await upstream.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: (number | null)[];
        precipitation?: (number | null)[];
        wind_speed_10m?: (number | null)[];
        weather_code?: (number | null)[];
      };
    };
    const times = j.hourly?.time ?? [];
    // Require an EXACT match for the requested UTC hour — never substitute a
    // different hour. No real data for this moment ⇒ 404 (real-data-only).
    const idx = times.indexOf(hourIso);
    if (idx === -1) {
      weatherCache.set(cacheKey, null);
      res.status(404).json({ error: "no weather data" });
      return;
    }

    // The weather code is the one field we won't fabricate a default for: if
    // the archive has no observed code at this hour, treat it as unavailable.
    const rawCode = j.hourly?.weather_code?.[idx];
    if (rawCode == null) {
      weatherCache.set(cacheKey, null);
      res.status(404).json({ error: "no weather data" });
      return;
    }
    const code = Math.round(rawCode);
    const result: WeatherResult = {
      time: times[idx]!,
      temperatureC: j.hourly?.temperature_2m?.[idx] ?? null,
      windSpeedKmh: j.hourly?.wind_speed_10m?.[idx] ?? null,
      precipitationMm: j.hourly?.precipitation?.[idx] ?? null,
      weatherCode: code,
      label: WMO_LABELS[code] ?? "Unknown",
    };
    weatherCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "weather fetch failed");
    res.status(502).json({ error: "weather unavailable" });
  }
});

export default router;
