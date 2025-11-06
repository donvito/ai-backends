'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import StatCard from '@/components/StatCard';
import { storage } from '@/lib/storage';
import { seedContacts, seedCompanies, seedDeals, seedTasks } from '@/lib/seed-data';
import { Contact, Company, Deal, Task } from '@/types';

export default function Dashboard() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let storedContacts = storage.getContacts();
    let storedCompanies = storage.getCompanies();
    let storedDeals = storage.getDeals();
    let storedTasks = storage.getTasks();

    if (storedContacts.length === 0) {
      storage.saveContacts(seedContacts);
      storedContacts = seedContacts;
    }
    if (storedCompanies.length === 0) {
      storage.saveCompanies(seedCompanies);
      storedCompanies = seedCompanies;
    }
    if (storedDeals.length === 0) {
      storage.saveDeals(seedDeals);
      storedDeals = seedDeals;
    }
    if (storedTasks.length === 0) {
      storage.saveTasks(seedTasks);
      storedTasks = seedTasks;
    }

    setContacts(storedContacts);
    setCompanies(storedCompanies);
    setDeals(storedDeals);
    setTasks(storedTasks);
  }, []);

  const totalRevenue = deals
    .filter((d) => d.stage === 'closed-won')
    .reduce((sum, d) => sum + d.value, 0);

  const pipelineValue = deals
    .filter((d) => !d.stage.startsWith('closed'))
    .reduce((sum, d) => sum + d.value, 0);

  const activeTasks = tasks.filter((t) => t.status !== 'completed').length;

  const recentDeals = deals
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const upcomingTasks = tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  return (
    <div>
      <Header title="Dashboard" />

      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contacts"
          value={contacts.length}
          change="+12% from last month"
          changeType="positive"
        />
        <StatCard
          title="Active Companies"
          value={companies.filter((c) => c.status === 'active').length}
          change="+5% from last month"
          changeType="positive"
        />
        <StatCard
          title="Pipeline Value"
          value={`$${(pipelineValue / 1000).toFixed(0)}K`}
          change="+18% from last month"
          changeType="positive"
        />
        <StatCard
          title="Active Tasks"
          value={activeTasks}
          change={`${tasks.length - activeTasks} completed`}
          changeType="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Recent Deals</h2>
          <div className="space-y-4">
            {recentDeals.map((deal) => {
              const company = companies.find((c) => c.id === deal.companyId);
              return (
                <div
                  key={deal.id}
                  className="flex items-center justify-between border-b border-gray-200 pb-4 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">{deal.title}</p>
                    <p className="text-sm text-gray-600">{company?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      ${(deal.value / 1000).toFixed(0)}K
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                        deal.stage === 'closed-won'
                          ? 'bg-green-100 text-green-800'
                          : deal.stage === 'closed-lost'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {deal.stage}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Upcoming Tasks</h2>
          <div className="space-y-4">
            {upcomingTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start justify-between border-b border-gray-200 pb-4 last:border-0"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{task.title}</p>
                  <p className="text-sm text-gray-600">{task.description}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`ml-4 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                    task.priority === 'high'
                      ? 'bg-red-100 text-red-800'
                      : task.priority === 'medium'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
