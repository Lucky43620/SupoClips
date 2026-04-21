"use client";

import { useState } from "react";
import { signUp } from "../../lib/auth-client";
import { track } from "@/lib/datafast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const authErrorMessages: Record<string, string> = {
  "User already exists": "Un compte existe déjà avec cet email",
  "Invalid email": "Email invalide",
};

export function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await signUp.email({
      email,
      password,
      name,
    });

    if (response.error) {
      setMessage(authErrorMessages[response.error.message || ""] || "Impossible de créer le compte");
      setLoading(false);
      return;
    }

    track("signup_completed", {
      auth_method: "email",
    });
    setMessage("Compte créé avec succès ! Connexion en cours...");
    setLoading(false);

    // Automatically sign in after successful sign up
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Inscription</CardTitle>
        <CardDescription>Créez un compte pour commencer</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Nom complet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
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
            minLength={8}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Création du compte..." : "Créer un compte"}
          </Button>
        </form>
        {message && (
          <p className={`mt-4 text-sm ${message.includes("succès") ? "text-green-600" : "text-red-600"}`}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
