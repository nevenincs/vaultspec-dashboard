import { common } from "./common";
import { documents } from "./documents";
import { errors } from "./errors";
import { features } from "./features";
import { projects } from "./projects";

export { common, documents, errors, features, projects };

export const sourceLocale = "en" as const;
export const defaultNS = "common" as const;

export const en = {
  common,
  documents,
  errors,
  features,
  projects,
} as const;

export const resources = {
  [sourceLocale]: en,
} as const;

export type EnglishResources = typeof en;
