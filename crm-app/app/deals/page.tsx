'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Button from '@/components/Button';
import Modal from '@/components/Modal';
import { storage } from '@/lib/storage';
import { Deal, Contact, Company } from '@/types';

const STAGES = [
  { id: 'lead', name: 'Lead', color: 'bg-gray-100' },
  { id: 'qualified', name: 'Qualified', color: 'bg-blue-100' },
  { id: 'proposal', name: 'Proposal', color: 'bg-yellow-100' },
  { id: 'negotiation', name: 'Negotiation', color: 'bg-orange-100' },
  { id: 'closed-won', name: 'Closed Won', color: 'bg-green-100' },
  { id: 'closed-lost', name: 'Closed Lost', color: 'bg-red-100' },
];

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    value: 0,
    stage: 'lead' as Deal['stage'],
    probability: 50,
    contactId: '',
    companyId: '',
    expectedCloseDate: '',
  });

  useEffect(() => {
    setDeals(storage.getDeals());
    setContacts(storage.getContacts());
    setCompanies(storage.getCompanies());
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingDeal) {
      const updatedDeals = deals.map((d) =>
        d.id === editingDeal.id
          ? { ...formData, id: d.id, createdAt: d.createdAt, updatedAt: new Date().toISOString() }
          : d
      );
      setDeals(updatedDeals);
      storage.saveDeals(updatedDeals);
    } else {
      const newDeal: Deal = {
        ...formData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updatedDeals = [...deals, newDeal];
      setDeals(updatedDeals);
      storage.saveDeals(updatedDeals);
    }

    closeModal();
  };

  const handleEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setFormData({
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      probability: deal.probability,
      contactId: deal.contactId,
      companyId: deal.companyId,
      expectedCloseDate: deal.expectedCloseDate.split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this deal?')) {
      const updatedDeals = deals.filter((d) => d.id !== id);
      setDeals(updatedDeals);
      storage.saveDeals(updatedDeals);
    }
  };

  const handleStageChange = (dealId: string, newStage: Deal['stage']) => {
    const updatedDeals = deals.map((d) =>
      d.id === dealId
        ? { ...d, stage: newStage, updatedAt: new Date().toISOString() }
        : d
    );
    setDeals(updatedDeals);
    storage.saveDeals(updatedDeals);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDeal(null);
    setFormData({
      title: '',
      value: 0,
      stage: 'lead',
      probability: 50,
      contactId: '',
      companyId: '',
      expectedCloseDate: '',
    });
  };

  const getContactName = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    return contact ? `${contact.firstName} ${contact.lastName}` : 'Unknown';
  };

  const getCompanyName = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    return company ? company.name : 'Unknown';
  };

  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);
  const wonValue = deals
    .filter((d) => d.stage === 'closed-won')
    .reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <Header
        title="Deals Pipeline"
        action={<Button onClick={() => setIsModalOpen(true)}>Add Deal</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-600">Total Pipeline</p>
          <p className="text-2xl font-bold text-gray-900">
            ${(totalValue / 1000).toFixed(0)}K
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-600">Closed Won</p>
          <p className="text-2xl font-bold text-green-600">
            ${(wonValue / 1000).toFixed(0)}K
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <p className="text-sm text-gray-600">Total Deals</p>
          <p className="text-2xl font-bold text-gray-900">{deals.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.id);
          const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);

          return (
            <div key={stage.id} className="flex flex-col">
              <div className={`rounded-t-lg ${stage.color} p-3`}>
                <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                <p className="text-sm text-gray-600">
                  {stageDeals.length} deals · ${(stageValue / 1000).toFixed(0)}K
                </p>
              </div>
              <div className="space-y-3 rounded-b-lg bg-gray-50 p-3">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="cursor-pointer rounded-lg bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <h4 className="mb-2 font-medium text-gray-900">
                      {deal.title}
                    </h4>
                    <p className="mb-1 text-sm text-gray-600">
                      {getCompanyName(deal.companyId)}
                    </p>
                    <p className="mb-2 text-sm text-gray-500">
                      {getContactName(deal.contactId)}
                    </p>
                    <p className="mb-2 text-lg font-bold text-gray-900">
                      ${(deal.value / 1000).toFixed(0)}K
                    </p>
                    <div className="mb-2 text-xs text-gray-500">
                      Close: {new Date(deal.expectedCloseDate).toLocaleDateString()}
                    </div>
                    <div className="flex justify-between">
                      <select
                        value={deal.stage}
                        onChange={(e) =>
                          handleStageChange(deal.id, e.target.value as Deal['stage'])
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {STAGES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <div className="space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(deal);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(deal.id);
                          }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingDeal ? 'Edit Deal' : 'Add Deal'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Deal Title
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Value ($)
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.value}
                onChange={(e) =>
                  setFormData({ ...formData, value: parseInt(e.target.value) || 0 })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Probability (%)
              </label>
              <input
                type="number"
                required
                min="0"
                max="100"
                value={formData.probability}
                onChange={(e) =>
                  setFormData({ ...formData, probability: parseInt(e.target.value) || 0 })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Stage
            </label>
            <select
              value={formData.stage}
              onChange={(e) =>
                setFormData({ ...formData, stage: e.target.value as Deal['stage'] })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STAGES.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contact
            </label>
            <select
              required
              value={formData.contactId}
              onChange={(e) =>
                setFormData({ ...formData, contactId: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.firstName} {contact.lastName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company
            </label>
            <select
              required
              value={formData.companyId}
              onChange={(e) =>
                setFormData({ ...formData, companyId: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Expected Close Date
            </label>
            <input
              type="date"
              required
              value={formData.expectedCloseDate}
              onChange={(e) =>
                setFormData({ ...formData, expectedCloseDate: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editingDeal ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
