import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Hooks
import { useUser } from "@/hooks/use-auth";

// Components
import { Layout, FullPageLoader } from "@/components/layout";

// Pages
import { Login } from "@/pages/login";
import { Admin } from "@/pages/admin";
import {
  InboxPage,
  TasksPage,
  IssuesPage,
  ContactsPage,
  PropertiesPage,
  CallsPage
} from "@/pages/placeholders";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { data: user, isLoading } = useUser();

  if (isLoading) return <FullPageLoader />;
  if (!user) return <Redirect to="/login" />;

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function LoginPage() {
  const { data: user, isLoading } = useUser();
  if (isLoading) return <FullPageLoader />;
  if (user) return <Redirect to="/admin" />;
  return <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />

      <Route path="/">
        <Redirect to="/admin" />
      </Route>

      {/* Protected Routes */}
      <Route path="/inbox"><ProtectedRoute component={InboxPage} /></Route>
      <Route path="/tasks"><ProtectedRoute component={TasksPage} /></Route>
      <Route path="/issues"><ProtectedRoute component={IssuesPage} /></Route>
      <Route path="/contacts"><ProtectedRoute component={ContactsPage} /></Route>
      <Route path="/properties"><ProtectedRoute component={PropertiesPage} /></Route>
      <Route path="/calls"><ProtectedRoute component={CallsPage} /></Route>
      <Route path="/admin"><ProtectedRoute component={Admin} /></Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
