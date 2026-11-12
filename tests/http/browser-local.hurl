# Browser assets and application routes are public, while operational routes are private.
GET {{base}}/

HTTP 200
[Captures]
asset_path: regex /src="(\/assets\/[^\"]+\.js)"/
[Asserts]
header "Content-Security-Policy" contains "frame-ancestors 'none'"
body contains "name=\"popcorn-server\""

GET {{base}}{{asset_path}}

HTTP 200

GET {{base}}/settings

HTTP 200

GET {{base}}/player

HTTP 200

GET {{base}}/title/movie/550

HTTP 200

GET {{base}}/title/tv/1399

HTTP 200

GET {{base}}/title/person/1

HTTP 401

GET {{base}}/title/movie/

HTTP 401

GET {{base}}/title/movie/1/more

HTTP 401

GET {{base}}/title/movie/not-a-number

HTTP 401

GET {{base}}/health

HTTP 401

GET {{base}}/health
Authorization: Bearer {{token}}

HTTP 200

POST {{base}}/browser/session
{
  "ticket": "{{invalid_ticket}}"
}

HTTP 401

POST {{base}}/browser/session
Origin: http://untrusted.invalid
{
  "ticket": "{{ticket}}"
}

HTTP 403

GET {{base}}/browser/network

HTTP 401

POST {{base}}/browser/pair
Origin: {{base}}
{
  "code": "invalid"
}

HTTP 401

POST {{base}}/browser/player/{{player_id}}
{
  "context": { "sourceId": "fixture", "fileIndex": 0, "title": { "title": "Fixture" } },
  "position": 42
}

HTTP 401

GET {{base}}/browser/player/{{player_id}}

HTTP 401

# The valid launch ticket becomes an HttpOnly browser session cookie.
POST {{base}}/browser/session
Origin: {{base}}
{
  "ticket": "{{ticket}}"
}

HTTP 204
[Asserts]
header "Set-Cookie" contains "HttpOnly"
header "Set-Cookie" contains "SameSite=Strict"

POST {{base}}/browser/session
{
  "ticket": "{{ticket}}"
}

HTTP 204

GET {{base}}/health

HTTP 200

GET {{base}}/health
Origin: http://untrusted.invalid

HTTP 403

GET {{base}}/
Host: untrusted.invalid

HTTP 403

# The session cookie authenticates Connect RPC and browser diagnostics.
POST {{base}}/popcorn.v1.HistoryService/ListHistory
Origin: {{base}}
Connect-Protocol-Version: 1
{}

HTTP 200

POST {{base}}/browser/diagnostic
Origin: {{base}}
{
  "event": "media.browser_test",
  "clientTimeMs": {{browser_time}},
  "data": { "phase": "browser" }
}

HTTP 204

# Player intentions are private, validated and consumable by another browser session.
GET {{base}}/browser/player/{{player_id}}

HTTP 404

POST {{base}}/browser/player/{{player_id}}
{
  "position": -1
}

HTTP 400

POST {{base}}/browser/player/{{player_id}}
Origin: {{base}}
{
  "context": { "sourceId": "fixture", "fileIndex": 0, "title": { "title": "Fixture" } },
  "position": 42
}

HTTP 204

GET {{base}}/browser/player/{{player_id}}

HTTP 200
[Asserts]
header "Cache-Control" == "no-store"
jsonpath "$.position" == 42
jsonpath "$.context.sourceId" == "fixture"
jsonpath "$.context.fileIndex" == 0
jsonpath "$.context.title.title" == "Fixture"

POST {{base}}/browser/player/{{player_id}}
{
  "context": { "padding": "{{oversized_padding}}" },
  "position": 42
}

HTTP 413
