import { common } from "./common";
import { documents } from "./documents";
import { errors } from "./errors";
import { features } from "./features";
import { graph } from "./graph";
import { operations } from "./operations";
import { projects } from "./projects";
import { settings } from "./settings";
import { timeline } from "./timeline";

export {
  common,
  documents,
  errors,
  features,
  graph,
  operations,
  projects,
  settings,
  timeline,
};

export const sourceLocale = "en" as const;
export const defaultNS = "common" as const;

export const en = {
  common,
  documents,
  errors,
  features,
  graph,
  operations,
  projects,
  settings,
  timeline,
} as const;

export const resources = {
  [sourceLocale]: en,
} as const;

export type EnglishResources = typeof en;
