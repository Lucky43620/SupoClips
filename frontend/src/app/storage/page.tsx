"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import {
  ArrowLeft,
  HardDrive,
  Trash2,
  Film,
  Upload,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Video,
  Download,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ClipFile {
  id: string;
  filename: string;
  size: number;
  available: boolean;
}

interface TaskWithFiles {
  id: string;
  status: string;
  source_title?: string;
  source_type?: string;
  created_at: string;
  files_size: number;
  clips_size: number;
  source_video_size: number;
  source_video_available: boolean;
  clips: ClipFile[];
}

interface StorageInfo {
  disk: { total: number; used: number; free: number };
  breakdown: { clips: number; uploads: number };
  tasks: TaskWithFiles[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 o";
  const k = 1024;
  const sizes = ["o", "Ko", "Mo", "Go", "To"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-orange-400" : "bg-black";
  return (
    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "bg-green-100 text-green-800";
    case "processing": return "bg-blue-100 text-blue-800";
    case "error": return "bg-red-100 text-red-800";
    case "cancelled": return "bg-gray-100 text-gray-700";
    default: return "bg-yellow-100 text-yellow-800";
  }
}

function VideoPlayer({ src, label }: { src: string; label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <video
        controls
        preload="metadata"
        className="w-full rounded-lg bg-black max-h-72 object-contain"
        style={{ aspectRatio: "9/16", maxHeight: "320px" }}
      >
        <source src={src} />
        Votre navigateur ne supporte pas la lecture vidéo.
      </video>
    </div>
  );
}

function SourceVideoPlayer({ taskId }: { taskId: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Vidéo source complète</p>
      <video
        controls
        preload="metadata"
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: "320px" }}
      >
        <source src={`/api/tasks/${taskId}/source-video`} />
        Votre navigateur ne supporte pas la lecture vidéo.
      </video>
      <a
        href={`/api/tasks/${taskId}/source-video`}
        download
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black transition-colors mt-1"
      >
        <Download className="w-3 h-3" />
        Télécharger la vidéo source
      </a>
    </div>
  );
}

export default function StoragePage() {
  const { data: session, isPending } = useSession();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/storage/info", { cache: "no-store" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setInfo(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les données");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) load();
  }, [session?.user?.id, load]);

  const deleteTask = async (taskId: string) => {
    setDeletingId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setSuccessMsg(`Tâche supprimée (${data.files_deleted ?? 0} fichier(s) effacé(s))`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const cleanupOrphans = async () => {
    setError(null);
    try {
      const res = await fetch("/api/tasks/storage/cleanup", { method: "DELETE" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setSuccessMsg(
        `Nettoyage terminé — ${data.deleted_files} fichier(s) orphelin(s) supprimé(s) (${formatBytes(data.freed_bytes)} libérés)`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du nettoyage");
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isPending || isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b bg-white">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Retour</Button></Link>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-16 space-y-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Connexion requise</h1>
          <Link href="/sign-in"><Button>Se connecter</Button></Link>
        </div>
      </div>
    );
  }

  const totalTasksSize = info?.tasks.reduce((s, t) => s + t.files_size, 0) ?? 0;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Retour</Button></Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCleanup(true)}
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Nettoyage orphelins
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Gestion du stockage</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Visualisez et libérez l&apos;espace disque occupé par vos vidéos et clips générés
          </p>
        </div>

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}
        {successMsg && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700">{successMsg}</AlertDescription>
          </Alert>
        )}

        {info && (
          <>
            {/* Disk overview */}
            <div className="border rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-lg">Espace disque global</h2>
              <UsageBar used={info.disk.used} total={info.disk.total} />
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Utilisé</p>
                  <p className="font-semibold text-lg">{formatBytes(info.disk.used)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Libre</p>
                  <p className="font-semibold text-lg text-green-600">{formatBytes(info.disk.free)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total</p>
                  <p className="font-semibold text-lg">{formatBytes(info.disk.total)}</p>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                  <Film className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Clips générés</p>
                  <p className="font-bold text-xl">{formatBytes(info.breakdown.clips)}</p>
                </div>
              </div>
              <div className="border rounded-xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                  <Upload className="w-5 h-5 text-gray-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Uploads temporaires</p>
                  <p className="font-bold text-xl">{formatBytes(info.breakdown.uploads)}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tasks list */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">Vos tâches ({info.tasks.length})</h2>
                <span className="text-sm text-gray-500">Total fichiers : {formatBytes(totalTasksSize)}</span>
              </div>

              {info.tasks.length === 0 && (
                <p className="text-gray-500 text-sm py-8 text-center">Aucune tâche trouvée</p>
              )}

              {info.tasks.map((task) => {
                const expanded = expandedTasks.has(task.id);
                const hasContent = task.clips.length > 0 || task.source_video_available;

                return (
                  <div key={task.id} className="border rounded-xl overflow-hidden">
                    {/* Task header row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => hasContent && toggleExpand(task.id)}
                    >
                      {hasContent ? (
                        expanded
                          ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <div className="w-4" />
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {task.source_title || task.id}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-400">
                            {new Date(task.created_at).toLocaleDateString("fr-FR", {
                              day: "2-digit", month: "short", year: "numeric",
                            })}
                          </p>
                          {task.clips.length > 0 && (
                            <span className="text-xs text-gray-400">· {task.clips.length} clip{task.clips.length > 1 ? "s" : ""}</span>
                          )}
                          {task.source_video_available && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-blue-600">
                              <Video className="w-3 h-3" /> vidéo source dispo
                            </span>
                          )}
                        </div>
                      </div>

                      <Badge className={`text-xs flex-shrink-0 ${statusColor(task.status)}`}>
                        {task.status}
                      </Badge>

                      <span className="text-sm font-medium text-gray-700 w-20 text-right flex-shrink-0">
                        {task.files_size > 0 ? formatBytes(task.files_size) : "—"}
                      </span>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                        disabled={deletingId === task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(task.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Expanded content */}
                    {expanded && (
                      <div className="border-t bg-gray-50">
                        {/* Source video */}
                        {task.source_video_available && (
                          <div className="p-4 border-b">
                            <SourceVideoPlayer taskId={task.id} />
                            <p className="text-xs text-gray-400 mt-1">
                              Taille : {formatBytes(task.source_video_size)}
                            </p>
                          </div>
                        )}

                        {/* Generated clips */}
                        {task.clips.length > 0 && (
                          <div className="p-4 space-y-4">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              Clips générés ({task.clips.length})
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {task.clips.map((clip) => (
                                <div key={clip.id} className="space-y-2">
                                  {clip.available ? (
                                    <>
                                      <VideoPlayer
                                        src={`${API_URL}/clips/${clip.filename}`}
                                        label={clip.filename}
                                      />
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-400">{formatBytes(clip.size)}</span>
                                        <a
                                          href={`${API_URL}/clips/${clip.filename}`}
                                          download={clip.filename}
                                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black transition-colors"
                                        >
                                          <Download className="w-3 h-3" />
                                          Télécharger
                                        </a>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="border rounded-lg p-4 bg-white flex items-center gap-2 text-gray-400 text-sm">
                                      <Film className="w-4 h-4" />
                                      <span className="truncate font-mono text-xs">{clip.filename}</span>
                                      <span className="text-xs ml-auto flex-shrink-0">fichier manquant</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!task.source_video_available && task.clips.length === 0 && (
                          <div className="p-6 text-center text-gray-400 text-sm">
                            Aucun fichier disponible sur le disque
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Confirm delete task */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette tâche ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera la tâche et tous ses clips de la base de données
              ainsi que les fichiers vidéo associés sur le disque. Irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmDeleteId) deleteTask(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm cleanup orphans */}
      <AlertDialog open={confirmCleanup} onOpenChange={setConfirmCleanup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nettoyer les fichiers orphelins ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprime tous les fichiers dans le dossier clips qui ne sont
              plus référencés dans la base de données. Utile après des erreurs de traitement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                setConfirmCleanup(false);
                cleanupOrphans();
              }}
            >
              Nettoyer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
