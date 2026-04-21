import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { AdminUserToggle } from "@/components/admin/admin-user-toggle";
import { Badge } from "@/components/ui/badge";

const ACTIVE_TASK_STATUSES = ["queued", "processing", "pending"];

function statusBadgeClass(status: string) {
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "processing" || status === "queued" || status === "pending") return "bg-blue-100 text-blue-800";
  if (status === "error" || status === "failed") return "bg-red-100 text-red-800";
  if (status === "cancelled") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: "Terminé",
    processing: "Traitement",
    queued: "En file",
    pending: "En attente",
    error: "Erreur",
    failed: "Échec",
    cancelled: "Annulé",
  };
  return labels[status] || status;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-3 text-sm text-gray-600">Vous devez vous connecter pour voir cette page.</p>
        <Link href="/sign-in" className="mt-6 inline-block text-sm font-medium text-black underline">
          Aller à la connexion
        </Link>
      </main>
    );
  }

  const isAdmin = Boolean((session.user as { is_admin?: boolean }).is_admin);

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-3 text-sm text-gray-600">Vous êtes connecté, mais votre compte n'est pas administrateur.</p>
      </main>
    );
  }

  const { user: selectedUserId } = await searchParams;

  const [
    totalUsers,
    adminUsers,
    totalTasks,
    completedTasks,
    activeTasks,
    recentUsers,
    processingNow,
    recentGenerations,
    tasksByUser,
    selectedUser,
    selectedUserTasks,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { is_admin: true } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: "completed" } }),
    prisma.task.count({ where: { status: { in: ACTIVE_TASK_STATUSES } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        email: true,
        name: true,
        is_admin: true,
        createdAt: true,
      },
    }),
    prisma.task.findMany({
      where: { status: { in: ACTIVE_TASK_STATUSES } },
      orderBy: { updated_at: "desc" },
      take: 25,
      select: {
        id: true,
        status: true,
        created_at: true,
        updated_at: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        source: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      orderBy: { created_at: "desc" },
      take: 40,
      select: {
        id: true,
        status: true,
        created_at: true,
        generated_clips_ids: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        source: {
          select: {
            title: true,
            type: true,
          },
        },
      },
    }),
    prisma.task.groupBy({
      by: ["user_id"],
      _count: {
        _all: true,
      },
    }),
    selectedUserId
      ? prisma.user.findUnique({
          where: { id: selectedUserId },
          select: {
            id: true,
            email: true,
            name: true,
            is_admin: true,
          },
        })
      : Promise.resolve(null),
    selectedUserId
      ? prisma.task.findMany({
          where: { user_id: selectedUserId },
          orderBy: { created_at: "desc" },
          take: 40,
          select: {
            id: true,
            status: true,
            created_at: true,
            generated_clips_ids: true,
            source: {
              select: {
                title: true,
                type: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const generationCountByUser = new Map(tasksByUser.map((item) => [item.user_id, item._count._all]));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Tableau de bord admin</h1>
          <p className="mt-2 text-sm text-gray-600">Gérez les utilisateurs et suivez l'activité globale de la plateforme.</p>
        </div>
        <Link href="/" className="text-sm font-medium text-black underline">
          Retour à l'app
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Utilisateurs au total</p>
          <p className="mt-2 text-2xl font-semibold text-black">{totalUsers}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Admins</p>
          <p className="mt-2 text-2xl font-semibold text-black">{adminUsers}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Tâches au total</p>
          <p className="mt-2 text-2xl font-semibold text-black">{totalTasks}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Tâches terminées</p>
          <p className="mt-2 text-2xl font-semibold text-black">{completedTasks}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:col-span-2 lg:col-span-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">En cours de traitement</p>
          <p className="mt-2 text-2xl font-semibold text-black">{activeTasks}</p>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium">Tâches en cours</h2>
          <p className="text-sm text-gray-600">File active pour tous les utilisateurs.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tâche</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Mis à jour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {processingNow.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-gray-600" colSpan={4}>Aucune tâche n'est en cours de traitement.</td>
                </tr>
              ) : (
                processingNow.map((task) => (
                  <tr key={task.id}>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-black underline">
                        {task.id}
                      </Link>
                      <p className="text-xs text-gray-600 truncate max-w-[420px]">{task.source?.title || "Source sans titre"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{task.user.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusBadgeClass(task.status)}>{statusLabel(task.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{task.updated_at.toLocaleString("fr-FR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium">Générations récentes</h2>
          <p className="text-sm text-gray-600">Dernière activité des tâches sur la plateforme.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tâche</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Clips</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Créée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {recentGenerations.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3">
                    <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-black underline">
                      {task.id}
                    </Link>
                    <p className="text-xs text-gray-600 truncate max-w-[420px]">{task.source?.title || "Source sans titre"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{task.user.email}</td>
                  <td className="px-4 py-3">
                    <Badge className={statusBadgeClass(task.status)}>{statusLabel(task.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{task.generated_clips_ids.length}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{task.created_at.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium">Utilisateurs</h2>
          <p className="text-sm text-gray-600">Utilisateurs récents. Gérez l'accès admin et inspectez leurs tâches.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Rôle</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Générations</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Créé</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {recentUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-black">{user.name || "Utilisateur sans nom"}</p>
                    <p className="text-xs text-gray-600">{user.email}</p>
                    <Link href={`/admin?user=${user.id}`} className="text-xs text-black underline">
                      Voir les tâches
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {user.is_admin ? (
                      <Badge className="bg-black text-white">Admin</Badge>
                    ) : (
                      <Badge variant="outline">Utilisateur</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{generationCountByUser.get(user.id) || 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.createdAt.toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-3 text-right">
                    <AdminUserToggle
                      userId={user.id}
                      isAdmin={user.is_admin}
                      isCurrentUser={user.id === session.user.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Explorateur de tâches utilisateur</h2>
            <p className="text-sm text-gray-600">Inspectez les générations d'un utilisateur précis.</p>
          </div>
          {selectedUserId && (
            <Link href="/admin" className="text-sm font-medium text-black underline">
              Effacer le filtre
            </Link>
          )}
        </div>

        {!selectedUser ? (
          <div className="px-4 py-5 text-sm text-gray-600">Sélectionnez un utilisateur dans le tableau ci-dessus pour voir ses tâches.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-4 py-3 text-sm text-gray-700 border-b border-gray-200">
              Affichage : <span className="font-medium text-black">{selectedUser.name || selectedUser.email}</span> ({selectedUser.email})
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tâche</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Clips</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Créée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {selectedUserTasks.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-sm text-gray-600" colSpan={5}>Aucune tâche trouvée pour cet utilisateur.</td>
                  </tr>
                ) : (
                  selectedUserTasks.map((task) => (
                    <tr key={task.id}>
                      <td className="px-4 py-3">
                        <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-black underline">
                          {task.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{task.source?.title || "Source sans titre"}</td>
                      <td className="px-4 py-3">
                        <Badge className={statusBadgeClass(task.status)}>{statusLabel(task.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{task.generated_clips_ids.length}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{task.created_at.toLocaleString("fr-FR")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
