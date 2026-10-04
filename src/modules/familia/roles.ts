export type Role = "ADMIN" | "MEMBER";
export const toRole = (r: string): Role => (r === "ADMIN" ? "ADMIN" : "MEMBER");
