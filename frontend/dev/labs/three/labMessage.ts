// The lab's OWN typed message vocabulary and resolver.
//
// Two facts force this module to exist, and both are properties of production worth
// keeping rather than defects to route around:
//
//  1. TYPE closure — `MessageKey` is a mapped type over `typeof en`
//     (`platform/localization/message.ts`), so the key union is closed over the SHIPPED
//     catalog.
//  2. RUNTIME closure — `normalizeMessageDescriptor` (`message.ts:318`) rejects any key
//     absent from `MESSAGE_KEYS`, and `resolveMessageResult` then substitutes the safe
//     fallback. That is deliberate: it stops a typo leaking a raw message key to a user.
//
// The lab's copy no longer ships (see `registerLabMessages`), so production cannot know
// these keys — and giving them back would need `src/**` to import `dev/**`, which the
// one-way import law forbids. So the lab derives its key type from its OWN catalog and
// resolves its OWN keys, delegating every production key to the production resolver.
// Type safety holds on both sides of the fence, and neither side knows about the other.

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useLocalizedMessageResolver } from "@app/platform/localization/LocalizationProvider";
import type {
  AnyMessageDescriptor,
  MessageValues,
} from "@app/platform/localization/message";

import type { threeLab } from "./labMessages";

/** Dotted leaf paths of the lab catalog (`actions.fitToView`, `panels.appearance`, …). */
type LeafPath<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPath<T[K]>}`;
    }[keyof T & string];

type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** `foo_one` -> `foo`. The catalog stores PHYSICAL plural keys; descriptors name the
 *  LOGICAL one, exactly as production models it. Both forms are valid. */
type LogicalKey<K extends string> = K extends `${infer Base}_${PluralCategory}`
  ? Base
  : K;

type PhysicalLabKey = `graph:lab.${LeafPath<typeof threeLab>}`;

/** Every key the lab catalog defines, namespace-qualified. */
export type LabMessageKey = PhysicalLabKey | LogicalKey<PhysicalLabKey>;

/** The prefix that marks a key as the lab's own. */
const LAB_KEY_PREFIX = "graph:lab.";

/** A lab message descriptor — the lab's analogue of `MessageDescriptor`. */
export interface LabMessageDescriptor {
  readonly key: LabMessageKey;
  readonly values?: MessageValues;
}

/** A lab plural descriptor — the lab's analogue of `CountMessageDescriptor`. */
export interface LabCountMessageDescriptor {
  readonly key: LabMessageKey;
  readonly values: MessageValues & Readonly<{ count: number }>;
}

/**
 * Anything the lab can resolve: a production descriptor (the lab composes plenty of
 * real product messages) or one of its own.
 */
export type AnyLabDescriptor =
  | AnyMessageDescriptor
  | LabMessageDescriptor
  | LabCountMessageDescriptor;

function isLabDescriptor(descriptor: AnyLabDescriptor): boolean {
  return (
    typeof descriptor.key === "string" && descriptor.key.startsWith(LAB_KEY_PREFIX)
  );
}

/**
 * Resolve a lab-or-production descriptor to display copy.
 *
 * Production keys go through the production resolver UNCHANGED, keeping its fallback
 * and plural behaviour for every product message the lab renders. Only the lab's own
 * keys — which that resolver is designed to reject — are translated here directly,
 * against the bundle `registerLabMessages` merged in at boot.
 */
export function useLabMessageResolver(): (descriptor: AnyLabDescriptor) => string {
  const { i18n } = useTranslation();
  const resolveProduction = useLocalizedMessageResolver();
  return useCallback(
    (descriptor: AnyLabDescriptor) => {
      if (isLabDescriptor(descriptor)) {
        // The key is proven a lab key by `isLabDescriptor` and typed by
        // `LabMessageKey`; i18next's generic overloads are keyed to the SHIPPED
        // catalog, so it is passed as a plain string here.
        const translate = i18n.t.bind(i18n) as unknown as (
          key: string,
          values?: Record<string, unknown>,
        ) => string;
        return String(translate(descriptor.key, { ...descriptor.values }));
      }
      return resolveProduction(descriptor as AnyMessageDescriptor).message;
    },
    [i18n, resolveProduction],
  );
}

/** Single-descriptor convenience over {@link useLabMessageResolver}. */
export function useLabMessage(descriptor: AnyLabDescriptor): string {
  return useLabMessageResolver()(descriptor);
}
