export type UserRole = 'user' | 'admin';

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  description: string;
  publishedDate: string;
  stock: number;
  pages: number;
}

export interface Reservation {
  id: number;
  userId: string;
  bookId: number;
  reservationDate: string;
  dueDate: string;
  isReturned: boolean;
}

export interface LibraryUser {
  id?: string | null;
  address: string;
  userName: string;
  email: string;
  emailConfirmed: boolean;
  password: string;
  phoneNumber: string;
  role: number;
  phoneNumberConfirmed: boolean;
  lockoutEnd: string | null;
  lockoutEnabled: boolean;
  accessFailedCount: number;
  fullName: string;
}

export interface AuthClaims {
  [key: string]: unknown;
}
