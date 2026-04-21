"use client";

import { useState } from "react";
import { signIn } from "../../lib/auth-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { useRouter } from "next/navigation";

const authErrorMessages: Record<string, string> = {
  "Invalid credentials": "Identifiants invalides",
  "User not found": "Utilisateur introuvable",
};

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await signIn.email({
      email,
      password,
    });

    if (response.error) {
      setMessage(authErrorMessages[response.error.message || ""] || "Impossible de se connecter");
      setLoading(false);
      return;
    }

    setMessage("Connexion réussie !");
    setLoading(false);

    // Redirect after successful sign in
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 500);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Connectez-vous à votre compte</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </Button>
        </form>
        {message && (
          <p className={`mt-4 text-sm ${message.includes("réussie") ? "text-green-600" : "text-red-600"}`}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
