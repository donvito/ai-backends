import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

/**
 * Mock real-estate toolset for the Agents demo. Backed by an in-memory
 * listing catalog with viewing slots, so the agent can answer questions about
 * properties for sale and book viewing appointments.
 */

interface Property {
  propertyId: string;
  title: string;
  city: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  floorAreaSqm: number;
  description: string;
  features: string[];
  status: 'for_sale' | 'sold';
}

interface ViewingSlot {
  slotId: string;
  propertyId: string;
  date: string;
  time: string;
  booked: boolean;
}

interface Booking {
  confirmationCode: string;
  propertyId: string;
  slotId: string;
  name: string;
  email: string;
  createdAt: string;
}

const properties: Property[] = [
  {
    propertyId: 'PROP-2001',
    title: '3BR corner-unit condo at Verde Residences',
    city: 'Makati',
    address: 'Unit 27B, Verde Residences, Salcedo Village, Makati',
    price: 425000,
    bedrooms: 3,
    bathrooms: 2,
    floorAreaSqm: 118,
    description:
      'Bright corner unit with unobstructed skyline views, renovated kitchen, and two parking slots. Walking distance to Salcedo Park and weekend market.',
    features: ['2 parking slots', 'Balcony', 'Gym & pool amenities', 'Pet-friendly building'],
    status: 'for_sale',
  },
  {
    propertyId: 'PROP-2002',
    title: '4BR family house with garden',
    city: 'Quezon City',
    address: '14 Maginhawa Extension, Teachers Village, Quezon City',
    price: 380000,
    bedrooms: 4,
    bathrooms: 3,
    floorAreaSqm: 210,
    description:
      'Two-storey family home on a 250 sqm lot with a landscaped garden, covered garage for two cars, and a newly renovated kitchen.',
    features: ['250 sqm lot', 'Garden', '2-car garage', 'Solar water heater'],
    status: 'for_sale',
  },
  {
    propertyId: 'PROP-2003',
    title: 'Studio unit at High Street South',
    city: 'Taguig',
    address: 'Unit 811, High Street South Corporate Plaza Tower 2, BGC, Taguig',
    price: 155000,
    bedrooms: 1,
    bathrooms: 1,
    floorAreaSqm: 34,
    description:
      'Fully furnished studio in the heart of BGC, ideal for young professionals or as a rental investment. High rental yield area.',
    features: ['Fully furnished', 'High rental yield', 'Near BGC bus stops'],
    status: 'for_sale',
  },
  {
    propertyId: 'PROP-2004',
    title: '2BR loft with parking at Eastwood',
    city: 'Quezon City',
    address: 'Unit 5C, Eastwood Lofts, Libis, Quezon City',
    price: 265000,
    bedrooms: 2,
    bathrooms: 2,
    floorAreaSqm: 82,
    description: 'Double-height loft unit with one parking slot. Already sold - kept for reference inquiries.',
    features: ['Loft layout', '1 parking slot'],
    status: 'sold',
  },
];

/** Viewing slots are generated relative to "today" so the demo always offers upcoming dates. */
function isoDatePlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const viewingSlots: ViewingSlot[] = [
  { slotId: 'SLOT-3001', propertyId: 'PROP-2001', date: isoDatePlusDays(2), time: '10:00', booked: false },
  { slotId: 'SLOT-3002', propertyId: 'PROP-2001', date: isoDatePlusDays(2), time: '15:30', booked: false },
  { slotId: 'SLOT-3003', propertyId: 'PROP-2001', date: isoDatePlusDays(4), time: '11:00', booked: false },
  { slotId: 'SLOT-3004', propertyId: 'PROP-2002', date: isoDatePlusDays(3), time: '09:30', booked: false },
  { slotId: 'SLOT-3005', propertyId: 'PROP-2002', date: isoDatePlusDays(5), time: '14:00', booked: false },
  { slotId: 'SLOT-3006', propertyId: 'PROP-2003', date: isoDatePlusDays(1), time: '13:00', booked: false },
  { slotId: 'SLOT-3007', propertyId: 'PROP-2003', date: isoDatePlusDays(6), time: '16:30', booked: false },
];

const bookings: Booking[] = [];
let nextConfirmationNumber = 7001;

function findProperty(propertyId: string): Property {
  const property = properties.find((p) => p.propertyId.toLowerCase() === propertyId.trim().toLowerCase());
  if (!property) {
    throw new Error(`No property found with id "${propertyId}". Use search_properties to find listings first.`);
  }
  return property;
}

function formatPrice(price: number): string {
  return '$' + price.toLocaleString('en-US');
}

function summarizeProperty(property: Property): string {
  return (
    `${property.propertyId}: ${property.title} - ${property.city} - ${formatPrice(property.price)} - ` +
    `${property.bedrooms}BR/${property.bathrooms}BA, ${property.floorAreaSqm} sqm (${property.status === 'for_sale' ? 'for sale' : 'SOLD'})`
  );
}

function textResult<T>(text: string, details: T) {
  return {
    content: [{ type: 'text' as const, text }],
    details,
  };
}

const searchSchema = Type.Object({
  city: Type.Optional(Type.String({ description: 'Filter by city, e.g. "Makati" or "Quezon City"' })),
  maxPrice: Type.Optional(Type.Number({ description: 'Maximum price in USD' })),
  minBedrooms: Type.Optional(Type.Number({ description: 'Minimum number of bedrooms' })),
});

const searchPropertiesTool: AgentTool<typeof searchSchema> = {
  name: 'search_properties',
  label: 'Search listings',
  description:
    'Search properties for sale. Optional filters: city, maxPrice (USD), minBedrooms. Returns matching listings with ids.',
  parameters: searchSchema,
  execute: async (_toolCallId, params) => {
    const matches = properties.filter((property) => {
      if (property.status !== 'for_sale') return false;
      if (params.city && property.city.toLowerCase() !== params.city.trim().toLowerCase()) return false;
      if (params.maxPrice !== undefined && property.price > params.maxPrice) return false;
      if (params.minBedrooms !== undefined && property.bedrooms < params.minBedrooms) return false;
      return true;
    });
    if (matches.length === 0) {
      return textResult('No listings match those filters. Try relaxing the price or bedroom requirements.', {
        matches: [],
      });
    }
    return textResult(`Found ${matches.length} listing(s):\n${matches.map(summarizeProperty).join('\n')}`, {
      matches,
    });
  },
};

const detailsSchema = Type.Object({
  propertyId: Type.String({ description: 'Property id, e.g. PROP-2001' }),
});

const getPropertyDetailsTool: AgentTool<typeof detailsSchema> = {
  name: 'get_property_details',
  label: 'Property details',
  description: 'Get full details for a property listing: address, price, size, description, and features.',
  parameters: detailsSchema,
  execute: async (_toolCallId, params) => {
    const property = findProperty(params.propertyId);
    const text =
      `${property.title} (${property.propertyId})\n` +
      `Address: ${property.address}\n` +
      `Price: ${formatPrice(property.price)} | ${property.bedrooms}BR/${property.bathrooms}BA | ${property.floorAreaSqm} sqm\n` +
      `Status: ${property.status === 'for_sale' ? 'For sale' : 'Sold'}\n` +
      `Features: ${property.features.join(', ')}\n` +
      `${property.description}`;
    return textResult(text, { property });
  },
};

const slotsSchema = Type.Object({
  propertyId: Type.String({ description: 'Property id, e.g. PROP-2001' }),
});

const getViewingSlotsTool: AgentTool<typeof slotsSchema> = {
  name: 'get_viewing_slots',
  label: 'Viewing slots',
  description: 'List available viewing appointment slots for a property. Each slot has a slot id, date, and time.',
  parameters: slotsSchema,
  execute: async (_toolCallId, params) => {
    const property = findProperty(params.propertyId);
    if (property.status !== 'for_sale') {
      return textResult(`${property.propertyId} is already sold; viewings are no longer available.`, { slots: [] });
    }
    const available = viewingSlots.filter((slot) => slot.propertyId === property.propertyId && !slot.booked);
    if (available.length === 0) {
      return textResult(`No available viewing slots for ${property.propertyId} right now.`, { slots: [] });
    }
    const lines = available.map((slot) => `${slot.slotId}: ${slot.date} at ${slot.time}`);
    return textResult(`Available viewing slots for ${property.propertyId}:\n${lines.join('\n')}`, {
      slots: available,
    });
  },
};

const bookSchema = Type.Object({
  propertyId: Type.String({ description: 'Property id, e.g. PROP-2001' }),
  slotId: Type.String({ description: 'Viewing slot id from get_viewing_slots, e.g. SLOT-3001' }),
  name: Type.String({ description: "Visitor's full name" }),
  email: Type.String({ description: "Visitor's email address for the confirmation" }),
});

const bookViewingTool: AgentTool<typeof bookSchema> = {
  name: 'book_viewing',
  label: 'Book a viewing',
  description:
    'Book a viewing appointment for a property using a slot id from get_viewing_slots. Requires the visitor name and email. Returns a confirmation code.',
  parameters: bookSchema,
  execute: async (_toolCallId, params) => {
    const property = findProperty(params.propertyId);
    const slot = viewingSlots.find(
      (candidate) =>
        candidate.slotId.toLowerCase() === params.slotId.trim().toLowerCase() &&
        candidate.propertyId === property.propertyId
    );
    if (!slot) {
      throw new Error(`Slot "${params.slotId}" does not exist for ${property.propertyId}. Check get_viewing_slots.`);
    }
    if (slot.booked) {
      throw new Error(`Slot ${slot.slotId} is no longer available. Pick another slot from get_viewing_slots.`);
    }

    slot.booked = true;
    const booking: Booking = {
      confirmationCode: `VIEW-${nextConfirmationNumber++}`,
      propertyId: property.propertyId,
      slotId: slot.slotId,
      name: params.name,
      email: params.email,
      createdAt: new Date().toISOString(),
    };
    bookings.push(booking);

    const text =
      `Viewing booked! Confirmation code ${booking.confirmationCode}. ` +
      `${property.title} (${property.propertyId}) on ${slot.date} at ${slot.time} for ${params.name}. ` +
      `A confirmation email will be sent to ${params.email}.`;
    return textResult(text, { booking, property: summarizeProperty(property), slot });
  },
};

export const realEstateTools: AgentTool<any>[] = [
  searchPropertiesTool,
  getPropertyDetailsTool,
  getViewingSlotsTool,
  bookViewingTool,
];
