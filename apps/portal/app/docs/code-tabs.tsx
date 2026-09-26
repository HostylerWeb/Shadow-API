"use client";

import { useState } from "react";

const LANGS = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
  { id: "ruby", label: "Ruby" },
] as const;

type Lang = (typeof LANGS)[number]["id"];

export function CodeTabs({ base }: { base: string }) {
  const [lang, setLang] = useState<Lang>("curl");
  return (
    <div className="docs-code">
      <div className="docs-tabs" role="tablist" aria-label="Example language">
        {LANGS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={lang === item.id}
            className={lang === item.id ? "docs-tab active" : "docs-tab"}
            onClick={() => setLang(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <pre role="tabpanel">{samples(base)[lang]}</pre>
    </div>
  );
}

function samples(base: string): Record<Lang, string> {
  return {
    curl: `API_KEY="your_key"
CONNECTOR="custom_your_endpoint"

JOB=$(curl -s -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"connector_id\\":\\"$CONNECTOR\\",\\"inputs\\":{}}" \\
  ${base}/v1/jobs)
echo "$JOB"

# Poll until status is succeeded or failed, then:
curl -s -H "Authorization: Bearer $API_KEY" \\
  ${base}/v1/jobs/JOB_ID/result`,
    javascript: `const base = ${JSON.stringify(base)};
const key = process.env.API_KEY;
const headers = { authorization: "Bearer " + key, "content-type": "application/json" };

const started = await fetch(base + "/v1/jobs", {
  method: "POST",
  headers,
  body: JSON.stringify({ connector_id: "custom_your_endpoint", inputs: {} }),
});
const { job_id } = await started.json();

let status = "queued";
while (status === "queued" || status === "running") {
  await new Promise((r) => setTimeout(r, 2000));
  const poll = await fetch(base + "/v1/jobs/" + job_id, { headers });
  status = (await poll.json()).status;
}

const result = await fetch(base + "/v1/jobs/" + job_id + "/result", { headers });
console.log((await result.json()).outputs);`,
    python: `import os, time, requests

base = ${JSON.stringify(base)}
headers = {
    "Authorization": f"Bearer {os.environ['API_KEY']}",
    "Content-Type": "application/json",
}
job = requests.post(base + "/v1/jobs", headers=headers, json={
    "connector_id": "custom_your_endpoint",
    "inputs": {},
}).json()

status = "queued"
while status in ("queued", "running"):
    time.sleep(2)
    status = requests.get(base + "/v1/jobs/" + job["job_id"], headers=headers).json()["status"]

print(requests.get(base + "/v1/jobs/" + job["job_id"] + "/result", headers=headers).json()["outputs"])`,
    php: `<?php
$base = ${JSON.stringify(base)};
$key = getenv("API_KEY");
$headers = ["Authorization: Bearer $key", "Content-Type: application/json"];

function api(string $method, string $url, array $headers, ?string $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS => $body,
    ]);
    $json = json_decode(curl_exec($ch), true);
    curl_close($ch);
    return $json;
}

$job = api("POST", "$base/v1/jobs", $headers, json_encode([
    "connector_id" => "custom_your_endpoint",
    "inputs" => new stdClass(),
]));

do {
    sleep(2);
    $poll = api("GET", "$base/v1/jobs/{$job["job_id"]}", $headers);
} while (in_array($poll["status"], ["queued", "running"], true));

print_r(api("GET", "$base/v1/jobs/{$job["job_id"]}/result", $headers)["outputs"]);`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
  "time"
)

func main() {
  base := ${JSON.stringify(base)}
  body := bytes.NewBufferString(\`{"connector_id":"custom_your_endpoint","inputs":{}}\`)
  req, _ := http.NewRequest("POST", base+"/v1/jobs", body)
  req.Header.Set("Authorization", "Bearer "+os.Getenv("API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  var started struct{ JobID string \`json:"job_id"\` }
  json.NewDecoder(res.Body).Decode(&started)
  res.Body.Close()

  var status string
  for status == "" || status == "queued" || status == "running" {
    time.Sleep(2 * time.Second)
    poll, _ := http.NewRequest("GET", base+"/v1/jobs/"+started.JobID, nil)
    poll.Header.Set("Authorization", "Bearer "+os.Getenv("API_KEY"))
    pr, _ := http.DefaultClient.Do(poll)
    var body struct{ Status string \`json:"status"\` }
    json.NewDecoder(pr.Body).Decode(&body)
    pr.Body.Close()
    status = body.Status
  }
  fmt.Println(status)
}`,
    ruby: `require "json"
require "net/http"

base = ${JSON.stringify(base)}
key = ENV.fetch("API_KEY")

def call(method, url, key, body = nil)
  uri = URI(url)
  req = Net::HTTP.const_get(method).new(uri)
  req["Authorization"] = "Bearer #{key}"
  req["Content-Type"] = "application/json"
  req.body = body if body
  JSON.parse(Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |h| h.request(req) }.body)
end

job = call("Post", base + "/v1/jobs", key, { connector_id: "custom_your_endpoint", inputs: {} }.to_json)
status = "queued"
while %w[queued running].include?(status)
  sleep 2
  status = call("Get", base + "/v1/jobs/" + job["job_id"], key)["status"]
end
puts call("Get", base + "/v1/jobs/" + job["job_id"] + "/result", key)["outputs"]`,
  };
}
