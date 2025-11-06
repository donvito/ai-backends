'use client';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export default function Header({ title, action }: HeaderProps) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      {action && <div>{action}</div>}
    </div>
  );
}
