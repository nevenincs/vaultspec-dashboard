import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { useKeyboardNavigationSurface } from "../../stores/view/keyboardNavigation";

export function KeyboardNav() {
  const navigation = useKeyboardNavigationSurface();
  const resolveMessage = useLocalizedMessageResolver();
  const announcement =
    navigation.announcement === null
      ? ""
      : resolveMessage(navigation.announcement).message;

  return (
    <div aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );
}
