import { common } from "./common";
import { documents } from "./documents";
import { errors } from "./errors";
import { features } from "./features";
import { graph } from "./graph";
import { operations } from "./operations";
import { projects } from "./projects";

export { common, documents, errors, features, graph, operations, projects };

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
} as const;

export const resources = {
  [sourceLocale]: en,
} as const;

export type EnglishResources = typeof en;
