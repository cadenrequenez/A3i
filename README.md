# A3i
Artificial Anesthesia Administrative Intelligence (A3i) is an AI-driven platform designed to automate and optimize anesthesia scheduling and administrative workflows.  🚧 MVP in active development.

## Schedule Validation, Scoring, and AI Suggestions

### New backend endpoints
- `POST /api/v1/schedules/validate`
- `POST /api/v1/schedules/score`
- `POST /api/v1/schedules/ai-suggest-fixes`

All three endpoints require a Bearer token.

### Validate example
```bash
curl -X POST "https://a3i-backend.onrender.com/api/v1/schedules/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"facility_id":1,"year":2026,"month":2}'
```

### Score example
```bash
curl -X POST "https://a3i-backend.onrender.com/api/v1/schedules/score" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"facility_id":1,"year":2026,"month":2}'
```

### AI suggest fixes example
```bash
curl -X POST "https://a3i-backend.onrender.com/api/v1/schedules/ai-suggest-fixes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"facility_id":1,"year":2026,"month":2,"max_suggestions":3}'
```

### Relevant environment variables
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `SCORE_WEIGHT_FIRST_CALL` (default: `1.25`)
- `SCORE_WEIGHT_SECOND_CALL` (default: `1.0`)
- `SCORE_WEIGHT_WEEKEND` (default: `2.0`)
