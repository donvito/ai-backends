import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

/**
 * Mock customer-support toolset for the Agents demo. Backed by an in-memory
 * dataset so the agent can look up accounts, subscriptions, billing history,
 * and open support tickets without any external dependencies.
 */

interface Customer {
  customerId: string;
  name: string;
  email: string;
  memberSince: string;
  plan: string;
  planStatus: 'active' | 'past_due' | 'cancelled';
  seats: number;
  renewalDate: string;
  balanceDue: number;
}

interface Invoice {
  invoiceId: string;
  customerId: string;
  date: string;
  amount: number;
  status: 'paid' | 'failed' | 'open';
  description: string;
}

interface Ticket {
  ticketId: string;
  customerId: string;
  subject: string;
  description: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

const customers: Customer[] = [
  {
    customerId: 'CUST-1001',
    name: 'Jane Cruz',
    email: 'jane.cruz@example.com',
    memberSince: '2023-04-12',
    plan: 'Pro',
    planStatus: 'active',
    seats: 5,
    renewalDate: '2026-09-01',
    balanceDue: 0,
  },
  {
    customerId: 'CUST-1002',
    name: 'Mark Reyes',
    email: 'mark.reyes@example.com',
    memberSince: '2024-11-03',
    plan: 'Business',
    planStatus: 'past_due',
    seats: 20,
    renewalDate: '2026-08-15',
    balanceDue: 249.0,
  },
  {
    customerId: 'CUST-1003',
    name: 'Aiko Tanaka',
    email: 'aiko.tanaka@example.com',
    memberSince: '2022-01-20',
    plan: 'Starter',
    planStatus: 'cancelled',
    seats: 1,
    renewalDate: '2026-02-01',
    balanceDue: 0,
  },
];

const invoices: Invoice[] = [
  { invoiceId: 'INV-9101', customerId: 'CUST-1001', date: '2026-08-01', amount: 49.0, status: 'paid', description: 'Pro plan - monthly' },
  { invoiceId: 'INV-9042', customerId: 'CUST-1001', date: '2026-07-01', amount: 49.0, status: 'paid', description: 'Pro plan - monthly' },
  { invoiceId: 'INV-8988', customerId: 'CUST-1001', date: '2026-06-01', amount: 49.0, status: 'paid', description: 'Pro plan - monthly' },
  { invoiceId: 'INV-9110', customerId: 'CUST-1002', date: '2026-08-01', amount: 249.0, status: 'failed', description: 'Business plan - monthly (card declined)' },
  { invoiceId: 'INV-9050', customerId: 'CUST-1002', date: '2026-07-01', amount: 249.0, status: 'paid', description: 'Business plan - monthly' },
  { invoiceId: 'INV-8720', customerId: 'CUST-1003', date: '2026-01-01', amount: 9.0, status: 'paid', description: 'Starter plan - monthly (final invoice)' },
];

const tickets: Ticket[] = [
  {
    ticketId: 'TKT-501',
    customerId: 'CUST-1002',
    subject: 'Cannot add new team members',
    description: 'Seat limit error even though we are on the Business plan.',
    status: 'open',
    createdAt: '2026-08-05',
  },
];

let nextTicketNumber = 502;

function findCustomer(query: string): Customer | undefined {
  const normalized = query.trim().toLowerCase();
  return customers.find(
    (customer) => customer.customerId.toLowerCase() === normalized || customer.email.toLowerCase() === normalized
  );
}

function requireCustomer(customerId: string): Customer {
  const customer = findCustomer(customerId);
  if (!customer) {
    throw new Error(`No customer found for "${customerId}". Use lookup_customer first to find the customer id.`);
  }
  return customer;
}

function textResult<T>(text: string, details: T) {
  return {
    content: [{ type: 'text' as const, text }],
    details,
  };
}

const lookupCustomerSchema = Type.Object({
  query: Type.String({ description: 'Customer id (e.g. CUST-1001) or email address to look up' }),
});

const lookupCustomerTool: AgentTool<typeof lookupCustomerSchema> = {
  name: 'lookup_customer',
  label: 'Customer lookup',
  description: 'Look up a customer account by customer id or email address. Returns the customer profile.',
  parameters: lookupCustomerSchema,
  execute: async (_toolCallId, params) => {
    const customer = findCustomer(params.query);
    if (!customer) {
      return textResult(
        `No customer found matching "${params.query}". Ask the customer to confirm their account id or email.`,
        { found: false }
      );
    }
    const summary =
      `Customer ${customer.customerId}: ${customer.name} <${customer.email}>, member since ${customer.memberSince}. ` +
      `Plan: ${customer.plan} (${customer.planStatus}), ${customer.seats} seat(s), renews ${customer.renewalDate}. ` +
      `Balance due: $${customer.balanceDue.toFixed(2)}.`;
    return textResult(summary, { found: true, customer });
  },
};

const subscriptionSchema = Type.Object({
  customerId: Type.String({ description: 'Customer id, e.g. CUST-1001' }),
});

const getSubscriptionTool: AgentTool<typeof subscriptionSchema> = {
  name: 'get_subscription',
  label: 'Subscription status',
  description: 'Get the subscription plan, status, seat count, renewal date, and outstanding balance for a customer.',
  parameters: subscriptionSchema,
  execute: async (_toolCallId, params) => {
    const customer = requireCustomer(params.customerId);
    const summary =
      `Subscription for ${customer.customerId}: ${customer.plan} plan, status "${customer.planStatus}", ` +
      `${customer.seats} seat(s), renewal date ${customer.renewalDate}, balance due $${customer.balanceDue.toFixed(2)}.`;
    return textResult(summary, {
      customerId: customer.customerId,
      plan: customer.plan,
      status: customer.planStatus,
      seats: customer.seats,
      renewalDate: customer.renewalDate,
      balanceDue: customer.balanceDue,
    });
  },
};

const billingHistorySchema = Type.Object({
  customerId: Type.String({ description: 'Customer id, e.g. CUST-1001' }),
});

const getBillingHistoryTool: AgentTool<typeof billingHistorySchema> = {
  name: 'get_billing_history',
  label: 'Billing history',
  description: 'Get recent invoices for a customer, including payment status (paid, failed, or open).',
  parameters: billingHistorySchema,
  execute: async (_toolCallId, params) => {
    const customer = requireCustomer(params.customerId);
    const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.customerId);
    if (customerInvoices.length === 0) {
      return textResult(`No invoices found for ${customer.customerId}.`, { invoices: [] });
    }
    const lines = customerInvoices.map(
      (invoice) =>
        `${invoice.invoiceId} (${invoice.date}): $${invoice.amount.toFixed(2)} - ${invoice.status.toUpperCase()} - ${invoice.description}`
    );
    return textResult(`Invoices for ${customer.customerId}:\n${lines.join('\n')}`, { invoices: customerInvoices });
  },
};

const ticketsSchema = Type.Object({
  customerId: Type.String({ description: 'Customer id, e.g. CUST-1001' }),
});

const getSupportTicketsTool: AgentTool<typeof ticketsSchema> = {
  name: 'get_support_tickets',
  label: 'Support tickets',
  description: 'List existing support tickets for a customer.',
  parameters: ticketsSchema,
  execute: async (_toolCallId, params) => {
    const customer = requireCustomer(params.customerId);
    const customerTickets = tickets.filter((ticket) => ticket.customerId === customer.customerId);
    if (customerTickets.length === 0) {
      return textResult(`No support tickets found for ${customer.customerId}.`, { tickets: [] });
    }
    const lines = customerTickets.map(
      (ticket) => `${ticket.ticketId} [${ticket.status}] (${ticket.createdAt}): ${ticket.subject} - ${ticket.description}`
    );
    return textResult(`Tickets for ${customer.customerId}:\n${lines.join('\n')}`, { tickets: customerTickets });
  },
};

const createTicketSchema = Type.Object({
  customerId: Type.String({ description: 'Customer id, e.g. CUST-1001' }),
  subject: Type.String({ description: 'Short subject line for the ticket' }),
  description: Type.String({ description: 'Details of the issue as reported by the customer' }),
});

const createSupportTicketTool: AgentTool<typeof createTicketSchema> = {
  name: 'create_support_ticket',
  label: 'Create support ticket',
  description: 'Create a new support ticket for a customer. Returns the new ticket id.',
  parameters: createTicketSchema,
  execute: async (_toolCallId, params) => {
    const customer = requireCustomer(params.customerId);
    const ticket: Ticket = {
      ticketId: `TKT-${nextTicketNumber++}`,
      customerId: customer.customerId,
      subject: params.subject,
      description: params.description,
      status: 'open',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    tickets.push(ticket);
    return textResult(
      `Created ticket ${ticket.ticketId} for ${customer.customerId}: "${ticket.subject}". Status: open.`,
      { ticket }
    );
  },
};

export const customerSupportTools: AgentTool<any>[] = [
  lookupCustomerTool,
  getSubscriptionTool,
  getBillingHistoryTool,
  getSupportTicketsTool,
  createSupportTicketTool,
];
