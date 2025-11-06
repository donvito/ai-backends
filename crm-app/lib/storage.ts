import { Contact, Company, Deal, Task, Note } from '@/types';

const STORAGE_KEYS = {
  CONTACTS: 'crm_contacts',
  COMPANIES: 'crm_companies',
  DEALS: 'crm_deals',
  TASKS: 'crm_tasks',
  NOTES: 'crm_notes',
};

export const storage = {
  getContacts: (): Contact[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    return data ? JSON.parse(data) : [];
  },

  saveContacts: (contacts: Contact[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
  },

  getCompanies: (): Company[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.COMPANIES);
    return data ? JSON.parse(data) : [];
  },

  saveCompanies: (companies: Company[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  },

  getDeals: (): Deal[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.DEALS);
    return data ? JSON.parse(data) : [];
  },

  saveDeals: (deals: Deal[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.DEALS, JSON.stringify(deals));
  },

  getTasks: (): Task[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.TASKS);
    return data ? JSON.parse(data) : [];
  },

  saveTasks: (tasks: Task[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  },

  getNotes: (): Note[] => {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.NOTES);
    return data ? JSON.parse(data) : [];
  },

  saveNotes: (notes: Note[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  },
};
