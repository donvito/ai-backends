export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  position: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  website: string;
  phone: string;
  address: string;
  employees: number;
  revenue: number;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  title: string;
  value: number;
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed-won' | 'closed-lost';
  probability: number;
  contactId: string;
  companyId: string;
  expectedCloseDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  assignedTo: string;
  relatedTo?: {
    type: 'contact' | 'company' | 'deal';
    id: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  content: string;
  relatedTo: {
    type: 'contact' | 'company' | 'deal';
    id: string;
  };
  createdAt: string;
  updatedAt: string;
}
