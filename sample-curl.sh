#!/bin/bash

# Sample curl command for PDF Summarizer endpoint
# Replace YOUR_TOKEN with your actual bearer token

curl -X POST http://localhost:3000/api/v1/pdf-summarizer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "payload": {
      "url": "https://arxiv.org/pdf/2410.18890",
      "maxLength": 500
    },
    "config": {
      "provider": "openai",
      "model": "gpt-4.1-nano",
      "stream": false
    }
  }' 2>/dev/null | jq '.'