import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import NotFound from "@/pages/not-found";
import { useUser } from "@/hooks/use-auth";
import { Layout, FullPageLoader } from "@/components/layout";
import { Login } from "@/pages/login";
import { Admin } from "@/pages/admin";
import { CallPopPage } from "@/pages/call-pop";
import { InboxPage } from "@/pages/inbox";
import { TasksPage } from "@/pages/tasks";
import { ContactsPage } from "@/pages/contacts";
import { IssuesPage } from "@/pages/issues";
import { AssociationsPage } from "@/pages/associations";
import {
  CallsPage,
} from "@/pages/placeholders";
import { WhatsNewPage } from "@/pages/whats-new";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { data: user, isLoading } = useUser();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Redirect to="/login" />;
  return <Layout><Component /></Layout>;
}

function LoginPage() {
  const { data: user, isLoading } = useUser();
  if (isLoading) return <FullPageLoader />;
  if (user) return <Redirect to="/inbox" />;
  return <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/call-pop" component={CallPopPage} />
      <Route path="/">
        <Redirect to="/inbox" />
      </Route>
      <Route path="/inbox"><ProtectedRoute component={InboxPage} /></Route>
      <Route path="/tasks"><ProtectedRoute component={TasksPage} /></Route>
      <Route path="/issues"><ProtectedRoute component={IssuesPage} /></Route>
      <Route path="/contacts"><ProtectedRoute component={ContactsPage} /></Route>
      <Route path="/associations"><ProtectedRoute component={AssociationsPage} /></Route>
      <Route path="/properties"><Redirect to="/associations" /></Route>
      <Route path="/calls"><ProtectedRoute component={CallsPage} /></Route>
      <Route path="/admin"><ProtectedRoute component={Admin} /></Route>
      <Route path="/whats-new"><ProtectedRoute component={WhatsNewPage} /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
