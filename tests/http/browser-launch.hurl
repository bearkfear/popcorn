# Launcher authorization uses the ephemeral local token, never the TMDB credential.
POST {{base}}/browser/launch
{}

HTTP 401

POST {{base}}/browser/launch
Authorization: Bearer {{token}}
{}

HTTP 200
[Captures]
launch_ticket: jsonpath "$.ticket"

POST {{base}}/browser/session
{
  "ticket": "{{launch_ticket}}"
}

HTTP 204
[Asserts]
header "Set-Cookie" contains "HttpOnly"
header "Set-Cookie" contains "SameSite=Strict"
