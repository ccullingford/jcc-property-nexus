import { useState } from "react";
import { useLogin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Mail, User as UserIcon } from "lucide-react";

export function Login() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const login = useLogin();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    
    login.mutate(
      { email, name: name || "Anonymous" },
      {
        onError: (err) => {
          toast({ title: "Login failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex bg-secondary/50">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 border-r border-border bg-white shadow-2xl z-10">
        <div className="mx-auto w-full max-w-sm lg:w-[360px]">
          <div className="mb-10">
            <h2 className="mt-8 text-3xl font-display font-bold leading-9 tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="pl-10 h-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={login.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full name (Optional)</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Doe"
                  className="pl-10 h-12"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={login.isPending}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold group hover-elevate"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in..." : "Continue to Platform"}
              {!login.isPending && <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />}
            </Button>
          </form>
        </div>
      </div>
      
      <div className="hidden lg:block relative w-0 flex-1 overflow-hidden">
        {/* landing page hero scenic mountain landscape */}
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop"
          alt="Abstract architecture"
        />
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]" />
      </div>
    </div>
  );
}
