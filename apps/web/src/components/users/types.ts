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

/** Item de `GET /dashboard/seller-goals`: avance de la meta del periodo. */
export interface SellerGoalProgress {
  userId: string;
  periodType: string;
  periodValue: string;
  targetAmount: number;
  soldAmount: number;
  percentage: number;
}
