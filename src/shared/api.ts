export const ApiEndpoint = {
  OnAppInstall: "/internal/on-app-install",
  OnModMail: "/internal/on-modmail",
  OnShowStats: "/internal/menu/show-stats",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];
