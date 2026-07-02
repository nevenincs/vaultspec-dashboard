// Custom ESLint rule enforcing the `stable-selectors` project rule
// (.claude/rules/stable-selectors.md): a zustand / `useSyncExternalStore`
// selector must return RAW, referentially-stable state. A selector that returns
// a value freshly BUILT inside the selector argument mints a new reference every
// call, so `getSnapshot` returns a new value each render → React's
// "getSnapshot should be cached to avoid an infinite loop" → "Maximum update
// depth exceeded" crash. That failure class recurred four times in this codebase
// (crashed markdown-open, blanked the canvas, looped the right rail), so it is a
// build gate, not a vigilance task.
//
// WHAT IS FLAGGED — only SYNTACTICALLY-GUARANTEED-fresh returns, so the rule is
// precise and false-positive-free:
//   - an object literal `{...}` or array literal `[...]`
//   - an array-minting method call: `.map` / `.filter` / `.flatMap` / `.slice`
//     / `.concat`
// in the RETURN position of a selector passed to a store hook (`use*Store(...)`)
// or to `useShallow(...)`. Under `useShallow`, a top-level object of RAW fields
// is the INTENDED pattern (shallow compare), so only a freshly-minted FIELD VALUE
// is flagged (the nested-fresh-defeats-useShallow case).
//
// WHAT IS NOT FLAGGED — a bare function/`normalize*()` call is NOT assumed fresh:
// the codebase's sanctioned derive-in-selector escape hatch is a REF-PRESERVING
// normalizer that returns the SAME reference when its input is already canonical
// (e.g. `normalizeGraphFeatureDeltas` under `useShallow` in `useGraphLiveDeltaView`,
// verified ref-stable by the graph-implementation audit). Static analysis cannot
// prove a call is fresh, and flagging it would false-positive on that blessed
// pattern — so the guard targets the always-fresh literal/array-method forms and
// leaves ref-preserving normalizers to code review. (A non-ref-preserving
// normalizer almost always mints via a literal or `.map`/`.filter` internally at
// its OWN definition site, which stays a review concern.)

const FRESH_ARRAY_METHODS = new Set(["map", "filter", "flatMap", "slice", "concat"]);

// zustand `create<>()` hooks are named `use<Name>Store`; `useShallow` is handled
// separately. `useSyncExternalStore` is intentionally excluded here: its snapshot
// selector is a LATER argument, not arg0, so it does not fit the arg0-selector
// shape this rule inspects.
const STORE_HOOK_RE = /^use[A-Z]\w*Store$/;

/** The freshly-minted kind of `node`, or null when it is not guaranteed fresh. */
function freshMintKind(node) {
  if (!node) return null;
  if (node.type === "ObjectExpression") return "object literal";
  if (node.type === "ArrayExpression") return "array literal";
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    FRESH_ARRAY_METHODS.has(node.callee.property.name)
  ) {
    return `.${node.callee.property.name}() call`;
  }
  return null;
}

/**
 * Flatten an expression into the concrete values it can RETURN — unwrapping
 * ternaries (`a ? b : c`) and short-circuit logicals (`a && b`, `a ?? b`) into
 * their result operands. `a && obj` returns `obj` (or the falsy `a`); `a ?? b`
 * returns `a` or `b`; a ternary returns either branch.
 */
function returnedValues(expr, out) {
  if (!expr) return;
  if (expr.type === "ConditionalExpression") {
    returnedValues(expr.consequent, out);
    returnedValues(expr.alternate, out);
    return;
  }
  if (expr.type === "LogicalExpression") {
    // For `&&` the LEFT is a guard, not a normal result; for `||`/`??` either
    // side can be the result. Include the right always, and the left for `||`/`??`.
    if (expr.operator !== "&&") returnedValues(expr.left, out);
    returnedValues(expr.right, out);
    return;
  }
  out.push(expr);
}

/** Collect the selector function's own return-argument expressions, WITHOUT
 *  descending into nested functions (whose returns belong to a callback, not
 *  the selector). Handles expression-body arrows and block bodies. */
function selectorReturnExprs(fn) {
  const out = [];
  if (fn.body.type !== "BlockStatement") {
    // Expression-body arrow: the body IS the return.
    returnedValues(fn.body, out);
    return out;
  }
  const stack = [fn.body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.type !== "string") continue;
    // Do not cross into a nested function scope.
    if (
      node !== fn &&
      (node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "FunctionDeclaration")
    ) {
      continue;
    }
    if (node.type === "ReturnStatement") {
      returnedValues(node.argument, out);
      continue;
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c.type === "string") stack.push(c);
      } else if (child && typeof child.type === "string") {
        stack.push(child);
      }
    }
  }
  return out;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "A store selector must return raw, referentially-stable state; derivation that mints a fresh reference belongs in a useMemo outside the selector (stable-selectors project rule).",
    },
    schema: [],
    messages: {
      rawFresh:
        "A store selector must return RAW, referentially-stable state — this returns a freshly-minted {{kind}}, a new reference every call, which makes getSnapshot loop (React 'getSnapshot should be cached' → 'Maximum update depth exceeded'). Select the raw slice and derive in a useMemo OUTSIDE the selector (stable-selectors rule).",
      shallowFresh:
        "This useShallow selector returns an object whose field is a freshly-minted {{kind}} — useShallow compares only one level deep, so a fresh nested reference defeats it and getSnapshot loops. Memoize the derivation OUTSIDE the selector (stable-selectors rule).",
    },
  },
  create(context) {
    function isUseShallowCall(node) {
      return (
        node &&
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "useShallow"
      );
    }

    function isSelectorFn(node) {
      return (
        node &&
        (node.type === "ArrowFunctionExpression" ||
          node.type === "FunctionExpression")
      );
    }

    function checkRaw(fn) {
      for (const expr of selectorReturnExprs(fn)) {
        const kind = freshMintKind(expr);
        if (kind) {
          context.report({ node: expr, messageId: "rawFresh", data: { kind } });
        }
      }
    }

    function checkShallow(fn) {
      for (const expr of selectorReturnExprs(fn)) {
        if (expr.type !== "ObjectExpression") continue;
        for (const prop of expr.properties) {
          if (prop.type !== "Property") continue;
          const kind = freshMintKind(prop.value);
          if (kind) {
            context.report({
              node: prop.value,
              messageId: "shallowFresh",
              data: { kind },
            });
          }
        }
      }
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const name = node.callee.name;
        const arg0 = node.arguments[0];
        if (name === "useShallow") {
          if (isSelectorFn(arg0)) checkShallow(arg0);
          return;
        }
        if (STORE_HOOK_RE.test(name)) {
          // `useStore(useShallow(fn))`: the useShallow call is visited on its own.
          if (isUseShallowCall(arg0)) return;
          if (isSelectorFn(arg0)) checkRaw(arg0);
        }
      },
    };
  },
};
