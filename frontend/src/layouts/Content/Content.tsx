import type { PropsWithChildren } from "react";

export default function Content({ children }: PropsWithChildren) {
  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1480,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}