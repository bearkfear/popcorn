# LAN clients must pair on their own origin before accessing private state.
GET {{address}}/

HTTP 200

GET {{address}}/health

HTTP 401

POST {{address}}/browser/pair
Origin: {{address}}
{
  "code": "{{pairing_code}}"
}

HTTP 204

GET {{address}}/health

HTTP 200

GET {{address}}/browser/player/{{player_id}}

HTTP 200
[Asserts]
header "Cache-Control" == "no-store"
jsonpath "$.position" == 42
jsonpath "$.context.sourceId" == "fixture"

GET {{address}}/health
Origin: {{loopback_base}}

HTTP 403

GET {{address}}/media/00000000-0000-4000-8000-000000000042?token=invalid
Origin: http://untrusted.invalid

HTTP 403

GET {{address}}/media/00000000-0000-4000-8000-000000000042/stream?token=invalid&generation=1
Origin: http://untrusted.invalid

HTTP 403
