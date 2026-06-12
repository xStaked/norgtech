import { type UserRole } from "@/lib/auth";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
