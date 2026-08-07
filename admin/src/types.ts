export interface AdminUser {
  id: number;
  name: string;
  slug: string;
  role?: string;
  roles?: string[];
  email?: string;
  avatar_urls?: Record<string, string>;
}

export interface AuthResponse {
  token: string;
  user: AdminUser;
}

export interface PublicSettings {
  site_title?: string;
  site_description?: string;
}
