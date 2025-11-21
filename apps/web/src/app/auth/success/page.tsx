"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/api";
import { authClient } from "@/lib/auth-client";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

export default function SuccessPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const { data: session } = authClient.useSession();
  const createOrGetUser = useMutation(api.apiKeys.createOrGetUser);
  const createApiKey = useMutation(api.apiKeys.createApiKey);

  useEffect(() => {
    async function generateKey() {
      if (!session?.user) return;

      try {
        // 1. Ensure user exists in Convex
        const userId = await createOrGetUser({
          email: session.user.email,
          googleId: session.user.id, // Using auth id as googleId for now
        });

        // 2. Generate API Key
        const result = await createApiKey({
          userId,
          name: "CLI Key",
        });

        setApiKey(result.apiKey);
      } catch (err) {
        console.error(err);
        setError("Failed to generate API key");
      } finally {
        setIsLoading(false);
      }
    }

    if (session) {
      generateKey();
    } else {
        // Give it a moment to load session
        const timer = setTimeout(() => {
            if (!session) setIsLoading(false);
        }, 2000);
        return () => clearTimeout(timer);
    }
  }, [session, createOrGetUser, createApiKey]);

  const copyToClipboard = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-lg border-border">
          <CardContent className="pt-6 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
     return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-lg border-border">
          <CardHeader>
             <CardTitle className="text-destructive">Authentication Failed</CardTitle>
             <CardDescription>Please try logging in again.</CardDescription>
          </CardHeader>
          <CardFooter>
             <Button onClick={() => window.location.href = "/"}>Back to Login</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Authentication Successful!
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Copy your API key below to complete the CLI setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? (
            <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="relative rounded-md bg-muted p-4 font-mono text-sm break-all text-foreground border border-border">
              {apiKey || "Generating key..."}
              {apiKey && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-2 h-8 w-8"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <div className="w-full space-y-2 rounded-md bg-secondary/50 p-4 text-sm text-secondary-foreground">
            <p className="font-semibold">Next Steps:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Copy the API key above</li>
              <li>Return to your terminal</li>
              <li>Paste the key and press Enter</li>
            </ol>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
