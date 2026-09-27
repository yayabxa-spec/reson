import * as Location from "expo-location";
import { readRagSettings } from "./memory";

// ============================================================
// 天气服务：默认使用 uapis.cn 免费天气 API（无需注册/登录）。
// 定位方式（weatherLocMode）：
//   manual - 手动指定城市（weatherCity）
//   gps    - GPS 定位（expo-location 坐标 → BigDataCloud 逆地理 → 城市）
//   auto   - 手动城市优先，否则 GPS，GPS 失败回退 IP 自动定位
// 支持自定义接口地址。坐标逆地理使用 BigDataCloud（免费、无需 key）。
// ============================================================

export interface WeatherInfo {
  city: string;
  weather: string;
  temperature: number;
  windDirection: string;
  windPower: string;
  humidity: number;
}

export interface WeatherOverride {
  city?: string;
  baseUrl?: string;
  locMode?: "auto" | "gps" | "manual";
}

/** 获取 GPS 坐标（先取缓存位置，再实时定位，带超时） */
async function getGpsCoords(): Promise<{ lat: number; lon: number } | null> {
  try {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.status !== "granted") return null;

    // 优先用最近一次已知位置（快、室内也能拿到）
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      return { lat: last.coords.latitude, lon: last.coords.longitude };
    }

    // 实时定位（带 10 秒超时，避免一直等待 GPS 信号）
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
    if (!pos) return null;
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** 坐标 → 中文城市名（BigDataCloud 逆地理，免费无需 key） */
async function coordsToCity(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      const city =
        data?.city || data?.locality || data?.principalSubdivision || "";
      return String(city).trim() || null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** GPS 坐标 → 中文城市名（BigDataCloud 逆地理，免费无需 key） */
async function gpsToCity(): Promise<string | null> {
  try {
    // 仅当用户已授权时才用 GPS（避免启动时突然弹权限框）
    const coords = await getGpsCoords();
    if (!coords) return null;
    return coordsToCity(coords.lat, coords.lon);
  } catch {
    return null;
  }
}

/** 获取当前天气；失败返回 null（不影响主动消息生成） */
export async function fetchWeather(
  override?: WeatherOverride
): Promise<WeatherInfo | null> {
  try {
    const settings = await readRagSettings();
    if (!settings.weatherEnabled) return null;

    const city = override?.city ?? settings.weatherCity ?? "";
    const base = ((override?.baseUrl ?? settings.weatherBaseUrl) || "").trim();
    const locMode = override?.locMode ?? settings.weatherLocMode ?? "auto";
    const baseUrl = base || "https://uapis.cn/api/v1/misc/weather";

    let finalCity = city.trim();
    // manual 模式必须填城市；auto 模式手动城市优先
    if (!finalCity && locMode !== "manual") {
      // GPS 定位（auto 模式在手动城市为空时用 GPS）
      finalCity = (await gpsToCity()) || "";
    }

    const params: string[] = ["lang=zh"];
    if (finalCity) {
      params.push("city=" + encodeURIComponent(finalCity));
    }
    // 未带 city 时由 uapis 按 IP 自动定位
    const url = baseUrl.replace(/\/+$/, "") + "?" + params.join("&");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      const cityName = data?.city || data?.province || "";
      const weather = data?.weather || "";
      const temperature = data?.temperature;
      if (!weather || temperature == null) return null;
      return {
        city: String(cityName),
        weather: String(weather),
        temperature: Number(temperature),
        windDirection: String(data?.wind_direction || ""),
        windPower: String(data?.wind_power || ""),
        humidity: Number(data?.humidity || 0),
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** GPS 定位获取当前城市（设置页"使用定位获取"用），失败返回 null */
export async function locateCurrentCity(): Promise<{
  city: string;
  lat: number;
  lon: number;
} | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const coords = await getGpsCoords();
    if (!coords) return null;
    const city = await coordsToCity(coords.lat, coords.lon);
    if (!city) return null;
    return { city, lat: coords.lat, lon: coords.lon };
  } catch {
    return null;
  }
}

/** 把天气信息格式化为一段简短文本（注入角色提示词） */
export function formatWeatherText(w: WeatherInfo | null): string {
  if (!w) return "";
  const parts = [
    `${w.city || "你所在的城市"}现在是${w.weather}`,
    `气温${w.temperature}℃`,
  ];
  if (w.windDirection && w.windPower) {
    parts.push(`${w.windDirection}${w.windPower}`);
  }
  if (w.humidity) {
    parts.push(`湿度${w.humidity}%`);
  }
  return parts.join("，");
}
