export function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

export function getStatusColor(value?: string | null): string {
  const status = normalizeStatus(value);

  if (["APPROVED", "SUCCESS", "ACTIVE", "ENABLED", "ON_TIME", "PRESENT"].includes(status)) {
    return "green";
  }

  if (["PENDING"].includes(status)) {
    return "gold";
  }

  if (["REJECTED", "FAILED", "ERROR", "ABSENT", "MISSING"].includes(status)) {
    return "red";
  }

  if (["CANCELLED", "CANCELED", "DISABLED", "INACTIVE"].includes(status)) {
    return "default";
  }

  if (["HOLIDAY"].includes(status)) {
    return "cyan";
  }

  if (["LATE", "EARLY_LEAVE", "WARNING"].includes(status)) {
    return "gold";
  }

  if (["LEAVE"].includes(status)) {
    return "blue";
  }

  return "default";
}

export function getScopeColor(value?: string | null): string {
  const status = normalizeStatus(value);
  if (status === "CORE") return "blue";
  return "cyan";
}
