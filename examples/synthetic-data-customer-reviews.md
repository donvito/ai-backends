# Synthetic Data Generation - Customer Reviews Example

This example demonstrates how to generate realistic customer product reviews using the synthetic data generation endpoint.

## Use Case
Generate synthetic customer reviews for:
- Building review datasets for machine learning models
- Testing review management systems
- Creating demo content for e-commerce platforms
- Training review moderation systems
- Populating product pages with realistic reviews
- Sentiment analysis model training

## Example Request

### Generate 10 Product Reviews

```bash
curl -X POST http://localhost:3000/api/v1/synthetic-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "payload": {
      "prompt": "Generate realistic customer product reviews for various electronic devices and products. Reviews should include pros, cons, ratings, verified purchase status, and helpful votes. Include a mix of positive, negative, and neutral reviews. Make them authentic with specific details about product usage and personal experience.",
      "count": 10,
      "format": "array",
      "schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "review_id": {
              "type": "string",
              "description": "Unique review identifier"
            },
            "product_id": {
              "type": "string",
              "description": "Product identifier"
            },
            "product_name": {
              "type": "string",
              "description": "Name of the product being reviewed"
            },
            "product_category": {
              "type": "string",
              "enum": ["electronics", "home_appliances", "furniture", "fashion", "sports", "food", "beauty"],
              "description": "Product category"
            },
            "reviewer_name": {
              "type": "string",
              "description": "Name of the reviewer"
            },
            "reviewer_id": {
              "type": "string",
              "description": "Customer ID of the reviewer"
            },
            "rating": {
              "type": "number",
              "minimum": 1,
              "maximum": 5,
              "description": "Star rating (1-5)"
            },
            "title": {
              "type": "string",
              "description": "Review title/headline"
            },
            "body": {
              "type": "string",
              "description": "Full review content"
            },
            "pros": {
              "type": "array",
              "items": {"type": "string"},
              "description": "List of positive aspects"
            },
            "cons": {
              "type": "array",
              "items": {"type": "string"},
              "description": "List of negative aspects"
            },
            "verified_purchase": {
              "type": "boolean",
              "description": "Whether the reviewer verified the purchase"
            },
            "helpful_votes": {
              "type": "number",
              "description": "Number of people who found the review helpful"
            },
            "unhelpful_votes": {
              "type": "number",
              "description": "Number of people who found the review unhelpful"
            },
            "review_date": {
              "type": "string",
              "description": "ISO 8601 date when review was posted"
            },
            "reviewer_location": {
              "type": "string",
              "description": "City/location of the reviewer"
            },
            "recommendation": {
              "type": "boolean",
              "description": "Whether the reviewer recommends the product"
            }
          },
          "required": ["review_id", "product_id", "product_name", "reviewer_name", "rating", "title", "body", "verified_purchase"]
        }
      }
    },
    "config": {
      "provider": "ollama",
      "model": "gemma3:4b",
      "temperature": 0.85
    }
  }'
```

## Example Response

```json
{
  "data": [
    {
      "review_id": "REV-892847",
      "product_id": "PROD-45821",
      "product_name": "UltraBook Pro 15\" Laptop",
      "product_category": "electronics",
      "reviewer_name": "David Thompson",
      "reviewer_id": "CUST-67234",
      "rating": 5,
      "title": "Excellent laptop for professionals - blazingly fast!",
      "body": "I purchased this laptop 6 months ago and I've been extremely impressed with its performance. The build quality is exceptional, the keyboard is responsive, and the display is absolutely stunning. I use it daily for video editing and software development, and it handles everything I throw at it without any lag. The battery life is solid too, getting me through a full workday on a single charge. Highly recommended for anyone looking for a powerful ultrabook.",
      "pros": [
        "Blazingly fast performance",
        "Excellent build quality",
        "Responsive keyboard",
        "Stunning display",
        "Great battery life",
        "Lightweight and portable"
      ],
      "cons": [
        "Expensive",
        "Limited ports"
      ],
      "verified_purchase": true,
      "helpful_votes": 247,
      "unhelpful_votes": 8,
      "review_date": "2024-02-15T10:30:00Z",
      "reviewer_location": "San Francisco, CA",
      "recommendation": true
    },
    {
      "review_id": "REV-892848",
      "product_id": "PROD-45821",
      "product_name": "UltraBook Pro 15\" Laptop",
      "product_category": "electronics",
      "reviewer_name": "Jessica Wong",
      "reviewer_id": "CUST-89456",
      "rating": 3,
      "title": "Good laptop but has some quirks",
      "body": "The UltraBook Pro is a solid laptop with great specs, but I've encountered a few issues. The laptop runs hot during intensive tasks and the fans can get quite loud. Also, the trackpad sometimes registers double-clicks when I only intend a single click. Software-wise, it's been reliable, but I had to install additional cooling pads to manage the heat. For the price, I expected better thermal management. Still usable for most tasks, just not perfect.",
      "pros": [
        "Good performance",
        "Lightweight",
        "Good display",
        "Fast processor"
      ],
      "cons": [
        "Runs hot",
        "Loud fans",
        "Trackpad issues",
        "Expensive for the issues"
      ],
      "verified_purchase": true,
      "helpful_votes": 156,
      "unhelpful_votes": 23,
      "review_date": "2024-02-18T14:15:00Z",
      "reviewer_location": "Austin, TX",
      "recommendation": false
    },
    {
      "review_id": "REV-892849",
      "product_id": "PROD-45821",
      "product_name": "UltraBook Pro 15\" Laptop",
      "product_category": "electronics",
      "reviewer_name": "Michael Chen",
      "reviewer_id": "CUST-34567",
      "rating": 2,
      "title": "Disappointed with the build quality",
      "body": "I received this laptop and within 2 weeks the screen started having dead pixels. Additionally, the keyboard feels cheap compared to other ultrabooks at this price point. Customer service was helpful in processing a replacement, but receiving a defective unit initially was frustrating. I'm still waiting on the replacement unit, so I can't fully assess the product quality yet.",
      "pros": [
        "Responsive customer service",
        "Good processor"
      ],
      "cons": [
        "Dead pixels out of the box",
        "Poor keyboard quality",
        "Quality control issues",
        "Long replacement process"
      ],
      "verified_purchase": true,
      "helpful_votes": 189,
      "unhelpful_votes": 42,
      "review_date": "2024-02-20T09:45:00Z",
      "reviewer_location": "Seattle, WA",
      "recommendation": false
    }
  ],
  "provider": "ollama",
  "model": "gemma3:4b",
  "usage": {
    "input_tokens": 1450,
    "output_tokens": 3250,
    "total_tokens": 4700
  },
  "metadata": {
    "count": 10,
    "format": "array",
    "schema_provided": true,
    "validation_passed": true
  }
}
```

## Key Schema Features

- **Review ID**: Unique identifier for tracking and indexing
- **Product Information**: Product ID, name, and category
- **Reviewer Profile**: Name, ID, and location
- **Rating**: 1-5 star rating system
- **Content**: Title and detailed body text
- **Structured Feedback**: Pros and cons lists
- **Verification**: Verified purchase badge
- **Engagement Metrics**: Helpful/unhelpful votes
- **Recommendation**: Whether reviewer recommends the product
- **Timestamp**: Review posting date

## Python Example

```python
import requests
import json
from datetime import datetime

def generate_product_reviews(product_name, product_category="electronics", count=10):
    """Generate synthetic customer reviews for a product."""
    
    url = "http://localhost:3000/api/v1/synthetic-data"
    
    schema = {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "review_id": {"type": "string"},
                "product_id": {"type": "string"},
                "product_name": {"type": "string"},
                "product_category": {
                    "type": "string",
                    "enum": ["electronics", "home_appliances", "furniture", "fashion", "sports", "food", "beauty"]
                },
                "reviewer_name": {"type": "string"},
                "reviewer_id": {"type": "string"},
                "rating": {"type": "number", "minimum": 1, "maximum": 5},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "pros": {"type": "array", "items": {"type": "string"}},
                "cons": {"type": "array", "items": {"type": "string"}},
                "verified_purchase": {"type": "boolean"},
                "helpful_votes": {"type": "number"},
                "unhelpful_votes": {"type": "number"},
                "review_date": {"type": "string"},
                "reviewer_location": {"type": "string"},
                "recommendation": {"type": "boolean"}
            }
        }
    }
    
    prompt = f"""Generate {count} realistic customer reviews for the product: "{product_name}" in the {product_category} category.
    Create reviews with varying ratings (mix of 1-5 stars).
    Include specific details about product usage and personal experience.
    Make pros and cons lists realistic and detailed.
    Include both verified and non-verified purchases.
    Vary the review dates within the last 3 months.
    Make some reviews helpful and some not."""
    
    payload = {
        "payload": {
            "prompt": prompt,
            "count": count,
            "format": "array",
            "schema": schema
        },
        "config": {
            "provider": "ollama",
            "model": "gemma3:4b",
            "temperature": 0.85
        }
    }
    
    response = requests.post(url, json=payload)
    return response.json()

# Example usage
result = generate_product_reviews("UltraBook Pro 15\" Laptop", "electronics", count=20)

# Analysis of generated reviews
reviews = result['data']

# Calculate average rating
avg_rating = sum(r['rating'] for r in reviews) / len(reviews)
print(f"Average Rating: {avg_rating:.1f}/5")

# Verified vs Unverified
verified_count = sum(1 for r in reviews if r['verified_purchase'])
print(f"Verified Purchases: {verified_count}/{len(reviews)}")

# Recommendation rate
recommend_count = sum(1 for r in reviews if r.get('recommendation', True))
print(f"Recommendation Rate: {recommend_count/len(reviews)*100:.1f}%")

# Rating distribution
rating_dist = {}
for r in reviews:
    rating = int(r['rating'])
    rating_dist[rating] = rating_dist.get(rating, 0) + 1

print("\nRating Distribution:")
for rating in sorted(rating_dist.keys()):
    print(f"  {rating} stars: {rating_dist[rating]} reviews")

# Sample review
print("\nSample Review:")
sample = reviews[0]
print(f"Title: {sample['title']}")
print(f"Rating: {'⭐' * sample['rating']}")
print(f"Review: {sample['body'][:200]}...")
print(f"Helpful Votes: {sample['helpful_votes']}")
```

## Node.js/JavaScript Example

```javascript
async function generateProductReviews(productName, count = 10) {
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        review_id: { type: "string" },
        product_id: { type: "string" },
        product_name: { type: "string" },
        product_category: { 
          type: "string",
          enum: ["electronics", "home_appliances", "furniture", "fashion", "sports", "food", "beauty"]
        },
        reviewer_name: { type: "string" },
        rating: { type: "number", minimum: 1, maximum: 5 },
        title: { type: "string" },
        body: { type: "string" },
        pros: { type: "array", items: { type: "string" } },
        cons: { type: "array", items: { type: "string" } },
        verified_purchase: { type: "boolean" },
        helpful_votes: { type: "number" },
        recommendation: { type: "boolean" }
      }
    }
  };

  const payload = {
    payload: {
      prompt: `Generate ${count} realistic customer reviews for: ${productName}. Include mixed ratings, specific details, pros and cons.`,
      count,
      format: "array",
      schema
    },
    config: {
      provider: "ollama",
      model: "gemma3:4b",
      temperature: 0.85
    }
  };

  const response = await fetch("http://localhost:3000/api/v1/synthetic-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return await response.json();
}

// Usage
const result = await generateProductReviews("Wireless Headphones", 15);
console.log("Generated Reviews:", result.data.length);
console.log("Average Rating:", 
  (result.data.reduce((sum, r) => sum + r.rating, 0) / result.data.length).toFixed(1));
```

## Use Cases & Applications

### 1. **Review Platform Development**
- Populate review systems with realistic test data
- Test review display and filtering
- Develop review sorting algorithms

### 2. **Sentiment Analysis Training**
- Create training datasets for sentiment models
- Train multi-class classifiers (positive/neutral/negative)
- Develop aspect-based sentiment analysis

### 3. **Recommendation Systems**
- Generate data for collaborative filtering
- Test recommendation algorithms
- Build user-item interaction matrices

### 4. **Content Moderation**
- Train content moderation systems
- Test spam detection algorithms
- Develop inappropriate content classifiers

### 5. **Product Analytics**
- Create sample data for dashboard testing
- Develop review summary features
- Build product quality metrics

### 6. **E-commerce Demo**
- Populate product pages with reviews
- Showcase review features to stakeholders
- Create realistic test environments

## Tips for Best Results

1. **Varied Ratings**: Request a mix of positive, negative, and neutral reviews
2. **Specific Details**: Prompt for reviews with specific product features and usage scenarios
3. **Authentic Tone**: Ask for realistic language that matches real customer reviews
4. **Structured Data**: Use schema to enforce consistent data format
5. **High Temperature**: Use 0.8-0.9 for variety and authenticity
6. **Category Context**: Include product category in prompt for category-specific details

## Data Quality Tips

- **Verification Mix**: Include both verified and non-verified purchases
- **Temporal Distribution**: Vary review dates across time periods
- **Engagement Variation**: Create reviews with varied helpful/unhelpful vote counts
- **Recommendation Mix**: Include both recommendations and non-recommendations
- **Rating Distribution**: Generate reviews across the full 1-5 star range

## Privacy Considerations

⚠️ **Important Notes:**
- Generated reviews are synthetic and do not represent real customers
- Use only for development, testing, and demonstration purposes
- Do not use generated reviews in production customer-facing applications
- Always disclose when data is synthetic or for testing purposes
- Comply with platform policies regarding review content
