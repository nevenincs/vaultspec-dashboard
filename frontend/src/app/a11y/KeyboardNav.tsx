import { useKeyboardNavigationSurface } from "../../stores/view/keyboardNavigation";

export function KeyboardNav() {
  const navigation = useKeyboardNavigationSurface();

  return (
    <div aria-live="polite" className="sr-only">
      {navigation.announcement}
    </div>
  );
}
