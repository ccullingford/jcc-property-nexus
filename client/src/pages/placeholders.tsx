import { Inbox, CheckSquare, AlertCircle, Users, Building2, Phone } from "lucide-react";

export function InboxPage() {
  return <Placeholder icon={Inbox} title="Unified Inbox" description="Your centralized communication hub." />;
}

export function TasksPage() {
  return <Placeholder icon={CheckSquare} title="Tasks" description="Manage and track your operational tasks." />;
}

export function IssuesPage() {
  return <Placeholder icon={AlertCircle} title="Issues" description="Track and resolve customer or internal issues." />;
}

export function ContactsPage() {
  return <Placeholder icon={Users} title="Contacts" description="Directory of clients, vendors, and team members." />;
}

export function PropertiesPage() {
  return <Placeholder icon={Building2} title="Properties" description="Asset and property management overview." />;
}

export function CallsPage() {
  return <Placeholder icon={Phone} title="Calls" description="Call logs, recordings, and analytics." />;
}

function Placeholder({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="h-20 w-20 rounded-2xl bg-primary/5 flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-3xl font-display font-bold text-foreground mb-3">{title}</h1>
      <p className="text-lg text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}
