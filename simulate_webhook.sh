#!/bin/bash

# Configuration
URL="http://localhost:3001/api/subscription/webhook"
TOKEN="4y8b2w8aotiInNEJLfy8B0IxynYWbXGMxXfuty46lccc6shT"

# Check arguments
if [ "$#" -lt 2 ]; then
    echo "Usage: ./simulate_webhook.sh <tenant_id> <tier>"
    echo "Example: ./simulate_webhook.sh abc-123 PROFESSIONAL"
    exit 1
fi

TENANT_ID=$1
TIER=$2
INVOICE_ID="sim-$(date +%s)"

echo "----------------------------------------------------"
echo "Simulating Xendit Webhook for NotarisOne (Localhost)"
echo "----------------------------------------------------"
echo "Tenant ID : $TENANT_ID"
echo "Tier      : $TIER"
echo "URL       : $URL"
echo "----------------------------------------------------"

# Send Webhook using curl
curl -X POST "$URL" \
     -H "Content-Type: application/json" \
     -H "x-callback-token: $TOKEN" \
     -d "{
       \"id\": \"$INVOICE_ID\",
       \"external_id\": \"ext-$TENANT_ID\",
       \"status\": \"PAID\",
       \"amount\": 500000,
       \"paid_amount\": 500000,
       \"metadata\": {
         \"tenantId\": \"$TENANT_ID\",
         \"tier\": \"$TIER\"
       }
     }"

echo -e "\n----------------------------------------------------"
echo "Check backend console for logs."
echo "----------------------------------------------------"
