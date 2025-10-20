# Synthetic Data Generation - Customer Conversations Example

This example demonstrates how to generate realistic customer support conversations using the synthetic data generation endpoint.

## Use Case
Generate synthetic customer service conversations for:
- Training customer support teams
- Testing chatbot systems
- Creating training datasets for AI models
- Load testing support systems
- Creating realistic demo data

## Example Request

### Generate 5 Customer Support Conversations

```bash
curl -X POST http://localhost:3000/api/v1/synthetic-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "payload": {
      "prompt": "Generate realistic customer support conversations between a customer and support agent. Include customer issues like product defects, billing problems, shipping delays, and account access issues. Each conversation should have multiple exchanges showing the resolution process. Include timestamps and sentiment indicators.",
      "count": 5,
      "schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "conversation_id": {
              "type": "string",
              "description": "Unique identifier for the conversation"
            },
            "customer_name": {
              "type": "string",
              "description": "Name of the customer"
            },
            "customer_id": {
              "type": "string",
              "description": "Customer account ID"
            },
            "issue_category": {
              "type": "string",
              "enum": ["product_defect", "billing", "shipping", "account", "technical", "other"],
              "description": "Category of the customer issue"
            },
            "messages": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "timestamp": {
                    "type": "string",
                    "description": "ISO 8601 timestamp"
                  },
                  "sender": {
                    "type": "string",
                    "enum": ["customer", "support_agent"],
                    "description": "Who sent the message"
                  },
                  "sender_name": {
                    "type": "string",
                    "description": "Name of the sender"
                  },
                  "message": {
                    "type": "string",
                    "description": "The message content"
                  },
                  "sentiment": {
                    "type": "string",
                    "enum": ["positive", "neutral", "negative"],
                    "description": "Sentiment of the message"
                  }
                },
                "required": ["timestamp", "sender", "message"]
              },
              "description": "Array of messages in the conversation"
            },
            "resolution_status": {
              "type": "string",
              "enum": ["resolved", "pending", "escalated"],
              "description": "Status of the issue resolution"
            },
            "satisfaction_score": {
              "type": "number",
              "minimum": 1,
              "maximum": 5,
              "description": "Customer satisfaction rating"
            },
            "duration_minutes": {
              "type": "number",
              "description": "How long the conversation took in minutes"
            }
          },
          "required": ["conversation_id", "customer_name", "issue_category", "messages", "resolution_status"]
        }
      }
    },
    "config": {
      "provider": "ollama",
      "model": "gemma3:4b",
      "temperature": 0.8
    }
  }'
```

## Example Response

```json
{
  "data": [
    {
      "conversation_id": "CONV-2024-001",
      "customer_name": "Sarah Mitchell",
      "customer_id": "CUST-45821",
      "issue_category": "product_defect",
      "messages": [
        {
          "timestamp": "2024-02-29T10:15:00Z",
          "sender": "customer",
          "sender_name": "Sarah Mitchell",
          "message": "Hi, I received my order yesterday but the laptop screen has a dead pixel in the center. This is really frustrating.",
          "sentiment": "negative"
        },
        {
          "timestamp": "2024-02-29T10:16:30Z",
          "sender": "support_agent",
          "sender_name": "Marcus Johnson",
          "message": "Hello Sarah! I'm sorry to hear you're experiencing this issue. I understand how frustrating that must be. Let me help you with this right away. Can you confirm your order number?",
          "sentiment": "positive"
        },
        {
          "timestamp": "2024-02-29T10:17:45Z",
          "sender": "customer",
          "sender_name": "Sarah Mitchell",
          "message": "Sure, it's ORD-892847. I have all the original packaging if I need to return it.",
          "sentiment": "neutral"
        },
        {
          "timestamp": "2024-02-29T10:18:20Z",
          "sender": "support_agent",
          "sender_name": "Marcus Johnson",
          "message": "Perfect! I see your order here. We can definitely arrange a replacement for you at no cost. Since the item is defective, I'll priority ship a replacement to you today. You can return the defective unit using our prepaid shipping label.",
          "sentiment": "positive"
        },
        {
          "timestamp": "2024-02-29T10:19:30Z",
          "sender": "customer",
          "sender_name": "Sarah Mitchell",
          "message": "That's great! Thank you so much for the quick resolution. I really appreciate it.",
          "sentiment": "positive"
        }
      ],
      "resolution_status": "resolved",
      "satisfaction_score": 4.5,
      "duration_minutes": 4.5
    }
  ],
  "provider": "ollama",
  "model": "gemma3:4b",
  "usage": {
    "input_tokens": 1250,
    "output_tokens": 2840,
    "total_tokens": 4090
  },
  "metadata": {
    "count": 5,
    "validation_passed": true
  }
}
```

## Key Schema Features

- **Conversation ID**: Unique identifier for tracking
- **Customer Information**: Name and ID for reference
- **Issue Categories**: Predefined categories (product_defect, billing, shipping, account, technical)
- **Message Arrays**: Multiple exchanges with timestamps and sender info
- **Sentiment Tracking**: Emotional tone of each message
- **Resolution Status**: Whether the issue was resolved or escalated
- **Satisfaction Score**: Post-conversation rating (1-5)
- **Duration**: How long the conversation took

## Use Cases & Applications

### 1. **Training Support Teams**
- Create realistic scenarios for training new support agents
- Practice handling various issue types
- Develop response templates

### 2. **Chatbot Training**
- Generate diverse conversation patterns
- Train NLP models for intent recognition
- Test chatbot response quality

### 3. **Quality Assurance**
- Load test support systems with realistic data
- Test conversation logging and analytics
- Validate sentiment analysis tools

### 4. **Analytics & Reporting**
- Create sample data for dashboard development
- Test reporting and analytics pipelines
- Demonstrate support metrics and KPIs

### 5. **Demo & Prototyping**
- Populate support ticketing systems
- Create realistic demo environments
- Show customers how the system works

## Tips for Best Results

1. **Detailed Prompts**: The more specific your prompt, the more realistic the conversations
2. **Schema Validation**: Always provide a schema to ensure consistent data structure
3. **Temperature Setting**: Use higher temperature (0.7-0.9) for variety in conversations
4. **Multiple Exchanges**: Request conversations with multiple message exchanges for realism
5. **Include Context**: Specify types of issues, customer personas, and desired outcomes
