import type { AgentTool } from '@earendil-works/pi-agent-core';
import { demoAgentTools } from './agent-tools';
import { customerSupportTools } from './agent-tools-customer-support';
import { realEstateTools } from './agent-tools-real-estate';

/**
 * Agent demo scenarios. Each scenario bundles a system prompt, a toolset, and
 * sample tasks so the Agents API can showcase different real-world use cases.
 */

export type AgentScenarioKey = 'general' | 'customer-support' | 'real-estate';

export interface AgentScenario {
  key: AgentScenarioKey;
  label: string;
  description: string;
  systemPrompt: string;
  tools: AgentTool<any>[];
  sampleTasks: string[];
}

const generalScenario: AgentScenario = {
  key: 'general',
  label: 'General assistant',
  description: 'A general-purpose assistant with a calculator, date/time, and weather lookup tools.',
  systemPrompt: [
    'You are a helpful assistant that completes tasks using the tools available to you.',
    'Use tools whenever they can provide accurate data instead of guessing.',
    'Think step by step, call tools as needed, and finish with a clear, concise answer to the task.',
  ].join(' '),
  tools: demoAgentTools,
  sampleTasks: [
    "What's the current weather in Manila, and what time is it there right now?",
    'Calculate (1875 * 23.5) / 100 and then add 42 to the result.',
    'Compare the current temperature in Tokyo and New York, and tell me the difference in degrees Celsius.',
  ],
};

const customerSupportScenario: AgentScenario = {
  key: 'customer-support',
  label: 'Customer support',
  description:
    'A support agent for a SaaS company. It can look up customer accounts, check subscriptions and billing history, and open support tickets. (Demo data: CUST-1001 jane.cruz@example.com, CUST-1002 mark.reyes@example.com, CUST-1003 aiko.tanaka@example.com.)',
  systemPrompt: [
    'You are a friendly customer support agent for a SaaS company.',
    'Always look up the customer account first using the id or email the customer provides.',
    'Use the tools to check subscriptions, billing history, and support tickets instead of guessing.',
    'Never invent account data. If you cannot find the customer, ask them to confirm their account id or email.',
    'When the customer reports an issue that cannot be resolved immediately, create a support ticket and share the ticket id.',
    'Finish with a clear, empathetic summary of what you found and any next steps.',
  ].join(' '),
  tools: customerSupportTools,
  sampleTasks: [
    "Hi, I'm jane.cruz@example.com. Can you check if my subscription is active and whether my last payment went through?",
    'My account is CUST-1002. Why is my account past due? Please check my billing history and open a ticket so someone reviews the failed charge.',
    "I'm aiko.tanaka@example.com. What's the status of my account, and do I have any outstanding balance or open tickets?",
  ],
};

const realEstateScenario: AgentScenario = {
  key: 'real-estate',
  label: 'Real estate',
  description:
    'A real-estate assistant that can search property listings, share full details, check viewing availability, and book viewing appointments. (Demo listings in Makati, Quezon City, and Taguig.)',
  systemPrompt: [
    'You are a real-estate assistant helping buyers learn about properties for sale and book viewing appointments.',
    'Use search_properties to find listings and get_property_details for full information; never invent listings or prices.',
    'To book a viewing: first call get_viewing_slots for the property, then call book_viewing with a valid slot id.',
    'Booking requires the visitor name and email; if the buyer has not provided them, ask for them instead of making them up.',
    'Always confirm bookings by repeating the property, date, time, and confirmation code.',
    'Finish with a clear summary and helpful next steps.',
  ].join(' '),
  tools: realEstateTools,
  sampleTasks: [
    "I'm looking for a home in Quezon City with at least 3 bedrooms under $400,000. What do you have? Tell me about the best match.",
    "Tell me more about PROP-2001, and book me a viewing at the earliest available slot. My name is Alex Tan, email alex.tan@example.com.",
    'Which condos do you have under $200,000? What viewing times are available for the cheapest one this week?',
  ],
};

const scenarios: Record<AgentScenarioKey, AgentScenario> = {
  general: generalScenario,
  'customer-support': customerSupportScenario,
  'real-estate': realEstateScenario,
};

export const agentScenarioKeys = Object.keys(scenarios) as AgentScenarioKey[];

export function getAgentScenario(key: AgentScenarioKey = 'general'): AgentScenario {
  const scenario = scenarios[key];
  if (!scenario) {
    throw new Error(`Unknown agent scenario: ${key}`);
  }
  return scenario;
}

export interface AgentScenarioInfo {
  key: AgentScenarioKey;
  label: string;
  description: string;
  sampleTasks: string[];
  tools: { name: string; label: string; description: string }[];
}

export function getAgentScenarioCatalog(): AgentScenarioInfo[] {
  return agentScenarioKeys.map((key) => {
    const scenario = scenarios[key];
    return {
      key: scenario.key,
      label: scenario.label,
      description: scenario.description,
      sampleTasks: scenario.sampleTasks,
      tools: scenario.tools.map((tool) => ({ name: tool.name, label: tool.label, description: tool.description })),
    };
  });
}
