const AVATAR_BACKGROUNDS = [
  "linear-gradient(135deg, var(--dash-accent), var(--dash-accent-2))",
  "var(--dash-green)",
  "var(--dash-amber)",
  "var(--dash-red)",
  "#6366f1",
];

export function formatDisplayName(email: string) {
  const localPart = email.split("@")[0]?.replace(/[0-9]+$/g, "") ?? "";
  const segmented = localPart
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[._\-\s]+/)
    .filter(Boolean);

  if (segmented.length === 0) return "Workspace Member";

  return segmented
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function getInitials(email: string) {
  const name = formatDisplayName(email);
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getAvatarBackground(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_BACKGROUNDS[Math.abs(hash) % AVATAR_BACKGROUNDS.length];
}

export function getRoleDisplay(role: string) {
  if (role === "superadmin") {
    return { label: "Superadmin", pillClass: "dash-role-super", icon: "⚡" };
  }
  return { label: "Admin", pillClass: "dash-role-admin", icon: "🔑" };
}

export function getStatusDisplay(profile: {
  is_suspended: boolean;
  force_password_reset: boolean;
}) {
  if (profile.is_suspended) {
    return { label: "Inactive", badgeClass: "dash-badge-amber" };
  }
  if (profile.force_password_reset) {
    return { label: "Pending", badgeClass: "dash-badge-amber" };
  }
  return { label: "Active", badgeClass: "dash-badge-green" };
}

export function getLastActiveLabel(
  profile: { id: string; created_at: string; force_password_reset: boolean },
  currentUserId: string,
) {
  if (profile.force_password_reset) return "Never";
  if (profile.id === currentUserId) return "Now";

  const daysSinceAdded = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / 86400000,
  );

  if (daysSinceAdded <= 1) return "Today";
  if (daysSinceAdded <= 7) return `${daysSinceAdded}d ago`;
  if (daysSinceAdded <= 30) return `${Math.floor(daysSinceAdded / 7)}w ago`;

  return "Yesterday";
}
