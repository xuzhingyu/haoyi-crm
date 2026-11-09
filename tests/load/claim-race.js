import http from "k6/http";
import { Counter } from "k6/metrics";

const success = new Counter("claim_success");
const conflict = new Counter("claim_conflict");
const unexpected = new Counter("claim_unexpected");

export const options = {
  scenarios: {
    same_lead_race: {
      executor: "per-vu-iterations",
      vus: 100,
      iterations: 1,
      maxDuration: "30s",
    },
  },
  thresholds: {
    claim_success: ["count==1"],
    claim_conflict: ["count==99"],
    claim_unexpected: ["count==0"],
  },
};

export default function () {
  const response = http.post(
    `${__ENV.BASE_URL}/api/v1/leads/${__ENV.LISTING_ID}/claim`,
    null,
    {
      headers: {
        Authorization: `Bearer ${__ENV.ACCESS_TOKEN}`,
        "Idempotency-Key": `race-${__VU}-${Date.now()}`,
      },
    },
  );
  if (response.status === 201) success.add(1);
  else if (response.status === 409) conflict.add(1);
  else unexpected.add(1);
}
