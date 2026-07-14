import { common } from "./common";
import { errors } from "./errors";

export { common, errors };

export const sourceLocale = "en" as const;
export const defaultNS = "common" as const;

export const en = {
  common,
  errors,
} as const;

export const resources = {
  [sourceLocale]: en,
} as const;

export type EnglishResources = typeof en;
