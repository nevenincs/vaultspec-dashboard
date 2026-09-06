import { Button } from "../kit";

export function BehaviorBearingWrapper({ onCommit }: { onCommit: () => void }) {
  return (
    <div data-confirmation-shell>
      <Button onClick={onCommit}>Commit</Button>
    </div>
  );
}
