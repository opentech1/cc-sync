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
import { authClient } from "@/lib/auth-client";
import { Github } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [isPending, setIsPending] = useState(false);

  const handleLogin = async () => {
    setIsPending(true);
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/auth/success",
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Claude Code Sync
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sync your Claude Code data across devices securely
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button
            variant="default"
            type="button"
            disabled={isPending}
            onClick={handleLogin}
            className="w-full"
          >
            <Github className="mr-2 h-4 w-4" />
            Continue with GitHub
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <div className="text-center text-sm text-muted-foreground">
            Secure authentication powered by Better Auth
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

