import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import jccLogo from "@assets/Color_logo_with_background_1772831996871.png";

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Microsoft authentication is not configured. Contact your administrator to set up Entra ID credentials.",
  access_denied: "Your account is not authorized to access this application. Contact your administrator.",
  domain_not_allowed: "Your email domain is not allowed. Sign in with your organization account.",
  auth_failed: "Authentication failed. Please try again.",
  invalid_state: "Session error during login. Please try again.",
};

export function Login() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if OAuth is configured on the server
  const { data: authStatus, isLoading: checkingConfig } = useQuery<{
    oauthConfigured: boolean;
  }>({
    queryKey: ["/api/auth/status"],
  });

  // Read error from query string (set after OAuth callback failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setErrorMessage(ERROR_MESSAGES[err] ?? "An unexpected error occurred. Please try again.");
      // Remove the error param from the URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleMicrosoftSignIn = () => {
    // Full browser redirect — the server starts the OAuth dance
    window.location.href = "/api/auth/microsoft";
  };

  return (
    <div className="min-h-screen w-full flex bg-secondary/50">
      {/* Left panel */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 border-r border-border bg-white shadow-2xl z-10">
        <div className="mx-auto w-full max-w-sm lg:w-[360px]">
          {/* Brand */}
          <div className="mb-10">
            <div className="mb-6">
              <img src={jccLogo} alt="JCC Property Group" className="w-full object-contain" />
            </div>
            <div className="flex items-center justify-center mb-4">
              <span className="text-6xl font-bold tracking-widest uppercase" style={{ color: "#414257" }}>NEXUS</span>
            </div>
            <h2 className="text-3xl font-display font-bold leading-9 tracking-tight text-center" style={{ color: "#414257" }}>
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-center" style={{ color: "#414257" }}>
              Sign in with your organization Microsoft account to continue.
            </p>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div
              className="flex items-start gap-3 mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
              data-testid="login-error"
            >
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          )}

          {/* Sign-in button */}
          {checkingConfig ? (
            <div className="flex items-center justify-center h-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : authStatus?.oauthConfigured === false ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800"
              data-testid="login-not-configured"
            >
              <p className="font-medium mb-1">Authentication not configured</p>
              <p className="text-xs text-amber-700">
                Set <code className="bg-amber-100 px-1 rounded font-mono">MICROSOFT_CLIENT_ID</code>,{" "}
                <code className="bg-amber-100 px-1 rounded font-mono">MICROSOFT_CLIENT_SECRET</code>, and{" "}
                <code className="bg-amber-100 px-1 rounded font-mono">MICROSOFT_TENANT_ID</code> in environment secrets.
              </p>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full h-12 text-sm font-semibold gap-3"
              onClick={handleMicrosoftSignIn}
              data-testid="button-microsoft-signin"
            >
              <MicrosoftLogo className="h-4 w-4" />
              Sign in with Microsoft
            </Button>
          )}

          <p className="mt-6 text-xs text-center" style={{ color: "#414257" }}>
            Access is restricted to authorized users only.
            <br />
            Contact your administrator if you need access.
          </p>
        </div>
      </div>

      {/* Right panel – hero image */}
      <div className="hidden lg:block relative w-0 flex-1 overflow-hidden">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop"
          alt="Office building"
        />
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]" />
      </div>
    </div>
  );
}
