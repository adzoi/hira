import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("error_rate");
const homeFeedDuration = new Trend("home_feed_duration");
const homepageVipDuration = new Trend("homepage_vip_duration");
const jobsPageDuration = new Trend("jobs_page_duration");
const listingsPageDuration = new Trend("listings_page_duration");

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "1m", target: 500 },
    { duration: "1m", target: 1000 },
    { duration: "2m", target: 1000 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    error_rate: ["rate<0.05"],        // 5% error tolerance (some 429s expected from single IP)
    http_req_duration: ["p(95)<500"],
    home_feed_duration: ["p(95)<500"],
    homepage_vip_duration: ["p(95)<500"],
    jobs_page_duration: ["p(95)<500"],
    listings_page_duration: ["p(95)<500"],
  },
};

const BASE = "https://sumwawnbeltxoppjdcjs.supabase.co/functions/v1";
const CATEGORIES = ["all", "design", "development", "marketing", "writing"];

export default function () {
  // __ENV.ANON_KEY passed via: k6 run -e ANON_KEY="eyJ..." load-test.js
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${__ENV.ANON_KEY}`,
    "apikey": __ENV.ANON_KEY,
  };

  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const page = Math.floor(Math.random() * 3) + 1;

  // ── Home feed ────────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE}/get-home-feed`, { headers });
    const ok = check(res, {
      "home feed 200": (r) => r.status === 200,
      "home feed has data": (r) => {
        try { return JSON.parse(r.body).ok === true } catch { return false }
      },
    });
    errorRate.add(!ok);
    homeFeedDuration.add(res.timings.duration);
  }

  sleep(0.5);

  // ── Homepage VIP ─────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE}/get-homepage-vip?limit=20`, { headers });
    const ok = check(res, {
      "homepage vip 200": (r) => r.status === 200,
      "homepage vip has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.ok === true && Array.isArray(body.items);
        } catch { return false }
      },
    });
    errorRate.add(!ok);
    homepageVipDuration.add(res.timings.duration);
  }

  sleep(0.5);

  // ── Jobs page ────────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE}/get-jobs-page?category=${category}&page=${page}`, { headers });
    const ok = check(res, {
      "jobs page 200": (r) => r.status === 200,
      "jobs page has data": (r) => {
        try { return JSON.parse(r.body).ok === true } catch { return false }
      },
    });
    errorRate.add(!ok);
    jobsPageDuration.add(res.timings.duration);
  }

  sleep(0.5);

  // ── Listings page ────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE}/get-listings-page?category=${category}&page=${page}`, { headers });
    const ok = check(res, {
      "listings page 200": (r) => r.status === 200,
      "listings page has data": (r) => {
        try { return JSON.parse(r.body).ok === true } catch { return false }
      },
    });
    errorRate.add(!ok);
    listingsPageDuration.add(res.timings.duration);
  }

  sleep(1);
}