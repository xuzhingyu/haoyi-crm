import http from "k6/http";
import { SharedArray } from "k6/data";

const tokens = new SharedArray("franchise tokens", () => JSON.parse(open(__ENV.TOKENS_FILE)));

export const options = {
  scenarios: {
    portal_reads: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 100,
      maxVUs: 300,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const token = tokens[(__VU - 1) % tokens.length];
  const path = __ITER % 3 === 0 ? "/api/v1/claims" : "/api/v1/pool?limit=50";
  http.get(`${__ENV.BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
