"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AdminUserToggleProps {
  userId: string;
  isAdmin: boolean;
  isCurrentUser: boolean;
}

export function AdminUserToggle({ userId, isAdmin, isCurrentUser }: AdminUserToggleProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleToggle = async () => {
    if (isCurrentUser && isAdmin) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${userId}/admin`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_admin: !isAdmin }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Impossible de mettre à jour l'utilisateur");
      }

      router.refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Impossible de mettre à jour l'utilisateur");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant={isAdmin ? "outline" : "default"}
        size="sm"
        onClick={handleToggle}
        disabled={isLoading || (isCurrentUser && isAdmin)}
      >
        {isLoading ? "Enregistrement..." : isAdmin ? "Retirer admin" : "Rendre admin"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
