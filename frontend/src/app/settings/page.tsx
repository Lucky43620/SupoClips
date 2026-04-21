"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { signOut, useSession } from "@/lib/auth-client";
import { track } from "@/lib/datafast";
import Link from "next/link";
import { Type, Palette, CheckCircle, AlertCircle, Settings, ArrowLeft, Mail } from "lucide-react";

interface UserPreferences {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  notifyOnCompletion: boolean;
}

export default function SettingsPage() {
  const [fontFamily, setFontFamily] = useState("TikTokSans-Regular");
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [completionEmails, setCompletionEmails] = useState(true);
  const [availableFonts, setAvailableFonts] = useState<Array<{ name: string, display_name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { data: session, isPending } = useSession();
  const isAdmin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);

  // Load available fonts from backend and inject them into the page
  useEffect(() => {
    const loadFonts = async () => {
      try {
        const response = await fetch('/api/fonts', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setAvailableFonts(data.fonts || []);

          // Dynamically load fonts using @font-face
          const fontFaceStyles = data.fonts.map((font: { name: string }) => {
            return `
              @font-face {
                font-family: '${font.name}';
                src: url('/api/fonts/${font.name}') format('truetype');
                font-weight: normal;
                font-style: normal;
              }
            `;
          }).join('\n');

          // Inject font styles into the page
          const styleElement = document.createElement('style');
          styleElement.id = 'custom-fonts';
          styleElement.innerHTML = fontFaceStyles;

          // Remove existing custom fonts style if present
          const existingStyle = document.getElementById('custom-fonts');
          if (existingStyle) {
            existingStyle.remove();
          }

          document.head.appendChild(styleElement);
        }
      } catch (error) {
        console.error('Failed to load fonts:', error);
      }
    };

    loadFonts();
  }, []);

  // Load user preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) return;

      setIsFetching(true);
      try {
        const response = await fetch('/api/preferences');
        if (response.ok) {
          const data: UserPreferences = await response.json();
          setFontFamily(data.fontFamily);
          setFontSize(data.fontSize);
          setFontColor(data.fontColor);
          setCompletionEmails(data.notifyOnCompletion ?? true);
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setIsFetching(false);
      }
    };

    loadPreferences();
  }, [session?.user?.id]);

  const handleSavePreferences = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fontFamily,
          fontSize,
          fontColor,
          notifyOnCompletion: completionEmails,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Impossible d'enregistrer les préférences");
      }

      track("preferences_saved");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setError(error instanceof Error ? error.message : "Impossible d'enregistrer les préférences");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/sign-in";
  };

  if (isPending || isFetching) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="space-y-4">
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-24">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-black mb-4">
              Connexion requise
            </h1>
            <p className="text-gray-600 mb-8">
              Vous devez vous connecter pour accéder à vos réglages
            </p>
            <Link href="/sign-in">
              <Button size="lg">Se connecter</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Button>
            </Link>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link href="/admin">
                  <Button variant="outline" size="sm">
                    Admin
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Se déconnecter
              </Button>
              <Avatar className="w-8 h-8">
                <AvatarImage src={session.user.image || ""} />
                <AvatarFallback className="bg-gray-100 text-black text-sm">
                  {session.user.name?.charAt(0) || session.user.email?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-black">{session.user.name}</p>
                <p className="text-xs text-gray-500">{session.user.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-6 h-6 text-black" />
              <h2 className="text-2xl font-bold text-black">
                Réglages
              </h2>
            </div>
            <p className="text-gray-600">
              Configurez vos préférences par défaut pour la génération de clips
            </p>
          </div>

          <Separator className="my-8" />

          <div className="space-y-8">
            {/* Font Preferences Section */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-black mb-1">
                  Réglages de police par défaut
                </h3>
                <p className="text-sm text-gray-600">
                  Ces réglages seront appliqués à toutes les nouvelles tâches vidéo
                </p>
              </div>

              {/* Font Family Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-black flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Police
                </Label>
                <Select value={fontFamily} onValueChange={setFontFamily} disabled={isLoading}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir une police" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFonts.map((font) => (
                      <SelectItem key={font.name} value={font.name}>
                        {font.display_name}
                      </SelectItem>
                    ))}
                    {availableFonts.length === 0 && (
                      <SelectItem value="TikTokSans-Regular">TikTok Sans Regular</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Font Size Slider */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-black">
                  Taille de police : {fontSize}px
                </Label>
                <div className="px-2">
                  <Slider
                    value={[fontSize]}
                    onValueChange={(value) => setFontSize(value[0])}
                    max={48}
                    min={12}
                    step={2}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>12px</span>
                  <span>48px</span>
                </div>
              </div>

              {/* Font Color Picker */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-black flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Couleur de police
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    disabled={isLoading}
                    className="w-12 h-10 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Input
                    type="text"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    disabled={isLoading}
                    placeholder="#FFFFFF"
                    className="flex-1 h-10"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {["#FFFFFF", "#000000", "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFontColor(color)}
                      disabled={isLoading}
                      className="w-8 h-8 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-black">Aperçu</Label>
                <div className="p-6 bg-black rounded-lg flex items-center justify-center min-h-[100px]">
                  <p
                    style={{
                      color: fontColor,
                      fontSize: `${Math.min(fontSize, 32)}px`,
                      fontFamily: `'${fontFamily}', system-ui, -apple-system, sans-serif`,
                      textAlign: 'center',
                      lineHeight: '1.4'
                    }}
                    className="font-medium"
                  >
                    Vos sous-titres ressembleront à ceci
                  </p>
                </div>
              </div>
            </div>

            {/* Notifications Section */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-black mb-1">
                  Notifications
                </h3>
                <p className="text-sm text-gray-600">
                  Gérez la façon dont vous recevez les mises à jour de vos clips
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="completion-emails" className="flex items-center gap-2 text-sm font-medium text-black cursor-pointer">
                  <Mail className="w-4 h-4" />
                  Emails de fin de traitement
                  <span className="text-gray-500 font-normal">- recevez une notification quand vos clips sont prêts</span>
                </Label>
                <Switch
                  id="completion-emails"
                  checked={completionEmails}
                  onCheckedChange={setCompletionEmails}
                  disabled={isLoading}
                />
              </div>
            </div>

            <Separator className="mb-4" />

            {/* Success/Error Messages */}
            {success && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-sm text-green-700">
                  Préférences enregistrées avec succès !
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-sm text-red-700">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleSavePreferences}
              disabled={isLoading}
              className="w-full h-11"
            >
              {isLoading ? "Enregistrement..." : "Enregistrer les préférences"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
