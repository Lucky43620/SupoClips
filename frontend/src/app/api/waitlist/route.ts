import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "L'email est requis" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ error: "Le service d'email n'est pas configuré" }, { status: 503 });
    }

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: "SupoClip <noreply@shiori.ai>",
      to: [normalizedEmail],
      subject: "Bienvenue sur la liste d'attente SupoClip",
      html: `
        <p>Merci d'avoir rejoint la liste d'attente SupoClip.</p>
        <p>Nous vous écrirons dès que l'accès anticipé sera disponible.</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Impossible d'envoyer l'email de confirmation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Ajouté à la liste d'attente avec succès" });
  } catch (error) {
    console.error("Waitlist signup error:", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
