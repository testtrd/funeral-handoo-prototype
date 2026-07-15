import type { AuthRole } from "@/lib/authService";

export type UserAccountStatus = "active" | "inactive";

export type UserAccount = {
  uid: string;
  name: string;
  email: string;
  department?: string;
  branchId?: string;
  branchIds?: string[];
  role: AuthRole;
  status: UserAccountStatus;
  mustChangePassword?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserAccountInput = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  department?: string;
  branchId?: string;
  branchIds?: string[];
  role: AuthRole;
  notes?: string;
};

export type ResetUserPasswordInput = {
  password: string;
  confirmPassword: string;
};

export type UpdateUserAccountInput = {
  name: string;
  department?: string;
  branchId?: string;
  branchIds?: string[];
  role: AuthRole;
  notes?: string;
};
