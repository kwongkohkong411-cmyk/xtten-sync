import type { PropsWithChildren } from "react";
import { colors } from "../../theme";

export default function PageContainer({ children }: PropsWithChildren) {
  return (
    <div
      style={{
        background: colors.background,
        minHeight: "100%",
      }}
    >
      {children}
    </div>
  );
}